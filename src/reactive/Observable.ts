import { Observer } from "./Observer";

export interface Observable<T> {
  getCurrValue(): T;
  getPrevValue(): T;
  getObservers(): Set<Observer<T>>;
  addObserver(observer: Observer<T>): void;
  deleteObserver(observer: Observer<T>): void;
  deleteObservers(): void;
  countObservers(): number;
  notifyObservers(): void;
  update(newValue: T): void;
  waitTillNonNull(): Promise<T>;
}

export const createObservable = <T>(initialValue: T): Observable<T> => {
  let currentValue: T = initialValue;
  let previousValue: T = initialValue;
  let changed: boolean = false;
  const observers: Set<Observer<T>> = new Set();

  const observable: Observable<T> = {
    getCurrValue: () => currentValue,
    getPrevValue: () => previousValue,
    getObservers: () => observers,
    addObserver: (observer: Observer<T>) => observers.add(observer),
    deleteObserver: (observer: Observer<T>) => observers.delete(observer),
    deleteObservers: () => observers.clear(),
    countObservers: () => observers.size,
    notifyObservers: () => {
      if (changed) {
        observers.forEach((observer) =>
          observer.onUpdate(currentValue, previousValue),
        );
        changed = false;
      }
    },
    update: (newValue: T) => {
      if (newValue !== currentValue) {
        previousValue = currentValue;
        currentValue = newValue;
        changed = true;
        observable.notifyObservers();
      }
    },
    waitTillNonNull: () => { // TODO 更好的实现
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (currentValue !== null) {
            clearInterval(interval);
            resolve(currentValue);
          }
        }, 100);
      });
    },
  };

  return observable;
};
