import { expect, it } from "vitest";
import { createObservable } from "../Observable";

it("test-observable", () => {
  const observable = createObservable(1);
  expect(observable.getCurrValue()).eq(1);
  expect(observable.getPrevValue()).eq(1);
  expect(observable.countObservers()).eq(0);

  let value;
  const observer = {
    onUpdate: (_value: number) => {
      value = _value;
    },
  };
  observable.addObserver(observer);
  observable.update(2);
  expect(value).eq(2);
  expect(observable.getCurrValue()).eq(2);
  expect(observable.getPrevValue()).eq(1);
  expect(observable.countObservers()).eq(1);
});
