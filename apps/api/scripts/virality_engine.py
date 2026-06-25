import os
import sys
import json
import argparse
import numpy as np

class RegressionTreeNode:
    def __init__(self, feature_idx=None, threshold=None, left=None, right=None, value=None):
        self.feature_idx = feature_idx
        self.threshold = threshold
        self.left = left
        self.right = right
        self.value = value

    def is_leaf(self):
        return self.value is not None

def fit_tree(X, y, depth, max_depth, min_samples_split):
    n_samples, n_features = X.shape
    if depth >= max_depth or n_samples < min_samples_split:
        return RegressionTreeNode(value=np.mean(y) if len(y) > 0 else 0.0)

    best_feature = None
    best_threshold = None
    best_sse = float("inf")
    
    for feat in range(n_features):
        thresholds = np.unique(X[:, feat])
        for thresh in thresholds:
            left_mask = X[:, feat] < thresh
            right_mask = ~left_mask
            if np.sum(left_mask) == 0 or np.sum(right_mask) == 0:
                continue
            
            y_left = y[left_mask]
            y_right = y[right_mask]
            
            sse = np.sum((y_left - np.mean(y_left))**2) + np.sum((y_right - np.mean(y_right))**2)
            if sse < best_sse:
                best_sse = sse
                best_feature = feat
                best_threshold = thresh

    if best_feature is None:
        return RegressionTreeNode(value=np.mean(y) if len(y) > 0 else 0.0)

    left_mask = X[:, best_feature] < best_threshold
    left_node = fit_tree(X[left_mask], y[left_mask], depth + 1, max_depth, min_samples_split)
    right_node = fit_tree(X[~left_mask], y[~left_mask], depth + 1, max_depth, min_samples_split)
    
    return RegressionTreeNode(feature_idx=best_feature, threshold=best_threshold, left=left_node, right=right_node)

def predict_tree(node, X):
    if node.is_leaf():
        return np.full(X.shape[0], node.value)
    
    left_mask = X[:, node.feature_idx] < node.threshold
    preds = np.zeros(X.shape[0])
    
    if np.any(left_mask):
        preds[left_mask] = predict_tree(node.left, X[left_mask])
    if np.any(~left_mask):
        preds[~left_mask] = predict_tree(node.right, X[~left_mask])
    return preds

def node_to_dict(node):
    if node.is_leaf():
        return {"value": float(node.value)}
    return {
        "feature_idx": int(node.feature_idx),
        "threshold": float(node.threshold),
        "left": node_to_dict(node.left),
        "right": node_to_dict(node.right)
    }

def dict_to_node(d):
    if "value" in d:
        return RegressionTreeNode(value=d["value"])
    return RegressionTreeNode(
        feature_idx=d["feature_idx"],
        threshold=d["threshold"],
        left=dict_to_node(d["left"]),
        right=dict_to_node(d["right"])
    )

class CustomGBDTRegressor:
    def __init__(self, n_estimators=10, learning_rate=0.1, max_depth=3):
        self.n_estimators = n_estimators
        self.lr = learning_rate
        self.max_depth = max_depth
        self.base_pred = 0.0
        self.trees = []

    def fit(self, X, y):
        self.base_pred = float(np.mean(y))
        y_pred = np.full(y.shape[0], self.base_pred)
        
        self.trees = []
        for _ in range(self.n_estimators):
            residuals = y - y_pred
            tree = fit_tree(X, residuals, depth=0, max_depth=self.max_depth, min_samples_split=2)
            self.trees.append(tree)
            
            # Update predictions
            update = predict_tree(tree, X)
            y_pred += self.lr * update

    def predict(self, X):
        y_pred = np.full(X.shape[0], self.base_pred)
        for tree in self.trees:
            y_pred += self.lr * predict_tree(tree, X)
        return y_pred

    def to_json(self):
        return {
            "base_pred": self.base_pred,
            "n_estimators": self.n_estimators,
            "lr": self.lr,
            "max_depth": self.max_depth,
            "trees": [node_to_dict(t) for t in self.trees]
        }

    def load_json(self, d):
        self.base_pred = d["base_pred"]
        self.n_estimators = d["n_estimators"]
        self.lr = d["lr"]
        self.max_depth = d["max_depth"]
        self.trees = [dict_to_node(t) for t in d["trees"]]

class ViralityPredictor:
    def __init__(self):
        self.model = CustomGBDTRegressor()
        self.feature_names = ["curiosity", "emotion", "speaking_pace", "surprise", "motion_intensity"]

    def extract_features(self, text, words, motion_events, audio_peaks=None):
        """
        Translates raw text transcript, aligned words, and motions to the 5 viral features.
        """
        # 1. Curiosity: Text hooks (questions, suspense keywords)
        clean_text = text.lower()
        question_words = ["why", "how", "what", "secret", "never", "hidden", "expose", "hacks", "trick"]
        hook_count = sum(1 for q in question_words if q in clean_text)
        if "?" in text:
            hook_count += 2
        s_curiosity = min(1.0, hook_count / 3.0)

        # 2. Emotion: Emotion tags or high pitch words in transcription
        emotional_keywords = ["love", "crazy", "insane", "unbelievable", "amazing", "fire", "danger", "shocking"]
        emotion_count = sum(1 for e in emotional_keywords if e in clean_text)
        s_emotion = min(1.0, emotion_count / 2.0)

        # 3. Speaking Pace: normalized words per minute (WPM)
        # Optimal pace is 130 to 160 WPM. Too slow or too fast is penalized.
        wpm = 140.0
        if words:
            total_words = len(words)
            dur = max(0.1, words[-1].get("end", 1.0) - words[0].get("start", 0.0))
            wpm = (total_words / dur) * 60.0
        
        # Bell curve normalization centered at 145 WPM
        s_pace = float(np.exp(-((wpm - 145.0) / 40.0)**2))

        # 4. Surprise: Velocity transients / sudden motion changes
        s_surprise = 0.0
        if len(motion_events) > 1:
            velocities = [np.sqrt(m.get("velocity", [0.0, 0.0])[0]**2 + m.get("velocity", [0.0, 0.0])[1]**2) for m in motion_events]
            diffs = np.diff(velocities)
            if len(diffs) > 0:
                s_surprise = min(1.0, float(np.max(np.abs(diffs))) * 5.0)

        # 5. Motion Intensity: Mean velocity of tracks
        s_motion = 0.0
        if motion_events:
            velocities = [np.sqrt(m.get("velocity", [0.0, 0.0])[0]**2 + m.get("velocity", [0.0, 0.0])[1]**2) for m in motion_events]
            s_motion = min(1.0, float(np.mean(velocities)) * 4.0)

        return {
            "curiosity": round(s_curiosity, 3),
            "emotion": round(s_emotion, 3),
            "speaking_pace": round(s_pace, 3),
            "surprise": round(s_surprise, 3),
            "motion_intensity": round(s_motion, 3)
        }

    def train_pipeline(self, output_model_path):
        """
        Trains the custom GBDT regressor on synthetic viral video features dataset.
        """
        print("[Virality Engine]: Generating dataset and training GBDT pipeline...", file=sys.stderr)
        
        # Generate synthetic training samples (N=200)
        np.random.seed(42)
        X = np.random.uniform(0.1, 1.0, (200, 5))
        # Label: High virality if curiosity, emotion, and pace are high
        # Target: Virality score from 20 to 98
        y = 30.0 + 40.0 * X[:, 0] + 15.0 * X[:, 1] + 20.0 * X[:, 2] - 10.0 * np.abs(X[:, 4] - 0.5)
        y = np.clip(y, 0.0, 100.0)

        self.model.fit(X, y)
        
        # Save model weights
        with open(output_model_path, "w", encoding="utf-8") as f:
            json.dump(self.model.to_json(), f, indent=2)
            
        print(f"[Virality Engine]: Model successfully saved at {output_model_path}", file=sys.stderr)

    def load_model(self, model_path):
        with open(model_path, "r", encoding="utf-8") as f:
            self.model.load_json(json.load(f))

    def predict_score(self, features):
        X = np.array([[
            features["curiosity"],
            features["emotion"],
            features["speaking_pace"],
            features["surprise"],
            features["motion_intensity"]
        ]])
        pred = self.model.predict(X)[0]
        # Keep score in range 0-100
        return float(np.clip(pred, 0.0, 100.0))

def main():
    parser = argparse.ArgumentParser(description="Virality Prediction Engine")
    parser.add_argument("--mode", required=True, choices=["train", "predict"], help="Operational mode")
    parser.add_argument("--model-path", required=True, help="Path to serialize/deserialize model JSON")
    parser.add_argument("--input-json", help="Path to input segment features json (needed for predict)")
    parser.add_argument("--output-json", help="Path to save prediction output json")
    args = parser.parse_args()

    predictor = ViralityPredictor()

    if args.mode == "train":
        predictor.train_pipeline(args.model_path)
        print(json.dumps({"status": "success", "message": "Model trained and saved."}))
        
    elif args.mode == "predict":
        if not args.input_json or not args.output_json:
            print(json.dumps({"status": "failed", "error": "Must provide --input-json and --output-json for predict mode"}))
            sys.exit(1)
            
        try:
            predictor.load_model(args.model_path)
            
            with open(args.input_json, "r", encoding="utf-8") as f:
                input_data = json.load(f)

            # Extract features from inputs or read raw inputs
            # Input format can contain segment list: [{"id": "seg1", "text": "...", "words": [...], "motion_events": [...]}]
            segments = input_data.get("segments", [])
            results = []

            for seg in segments:
                text = seg.get("text", "")
                words = seg.get("words", [])
                motion = seg.get("motion_events", [])
                
                features = predictor.extract_features(text, words, motion)
                score = predictor.predict_score(features)
                
                results.append({
                    "id": seg.get("id"),
                    "virality_score": round(score, 2),
                    "features": features
                })

            results.sort(key=lambda x: x["virality_score"], reverse=True)
            
            with open(args.output_json, "w", encoding="utf-8") as f:
                json.dump({"status": "success", "results": results}, f, indent=2)

            print(json.dumps({
                "status": "success",
                "output_file": args.output_json
            }))

        except Exception as e:
            print(json.dumps({
                "status": "failed",
                "error": str(e)
            }))
            sys.exit(1)

if __name__ == "__main__":
    main()
