export interface Observer<T> {
    onUpdate(currentValue: T, previousValue: T): void;
}