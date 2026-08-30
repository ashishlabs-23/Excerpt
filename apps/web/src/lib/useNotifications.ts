"use client";

import { useEffect, useState, useCallback } from "react";
import { getFirebaseMessaging, getToken, onMessage } from "./firebase";
import { authFetch } from "./api";

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<string | null> => {
    if (!supported || typeof window === "undefined") return null;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        const messaging = getFirebaseMessaging();
        if (messaging) {
          const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
          const token = await getToken(messaging, { vapidKey });
          if (token) {
            setFcmToken(token);
            // Save token to user profile via backend
            try {
              await authFetch("/api/notifications/register-device", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fcmToken: token, platform: "web" }),
              });
            } catch (err) {
              console.warn("[useNotifications]: Failed to register FCM token with API:", err);
            }
            return token;
          }
        }
      }
    } catch (err) {
      console.warn("[useNotifications]: Error requesting push permission:", err);
    }

    return null;
  }, [supported]);

  // Foreground notification handler
  useEffect(() => {
    const messaging = getFirebaseMessaging();
    if (!messaging) return;

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log("[useNotifications]: Foreground message received:", payload);
      if (Notification.permission === "granted") {
        new Notification(payload.notification?.title || "Clip Ready!", {
          body: payload.notification?.body || "Your video clip processing has completed.",
          icon: "/favicon.ico",
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    supported,
    permission,
    fcmToken,
    requestPermission,
  };
}
