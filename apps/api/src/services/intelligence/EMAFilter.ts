export class EMAFilter {
    private alpha: number;
    private currentVal: number | null = null;

    constructor(alpha: number = 0.2) {
        this.alpha = Math.max(0, Math.min(1, alpha));
    }

    public smooth(newValue: number): number {
        if (this.currentVal === null) {
            this.currentVal = newValue;
        } else {
            this.currentVal = (this.alpha * newValue) + ((1 - this.alpha) * this.currentVal);
        }
        return this.currentVal;
    }

    public reset(): void {
        this.currentVal = null;
    }
}

export class EMAFilter2D {
    private filterX: EMAFilter;
    private filterY: EMAFilter;

    constructor(alpha: number = 0.2) {
        this.filterX = new EMAFilter(alpha);
        this.filterY = new EMAFilter(alpha);
    }

    public smooth(x: number, y: number): { x: number, y: number } {
        return {
            x: this.filterX.smooth(x),
            y: this.filterY.smooth(y)
        };
    }

    public reset(): void {
        this.filterX.reset();
        this.filterY.reset();
    }
}
