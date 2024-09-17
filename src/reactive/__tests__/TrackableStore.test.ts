import { expect, it } from "vitest";
import { TrackableStore } from "../TrackableStore";

it("test-trackable-store", () => {
  const store = new TrackableStore({
    name: "test",
    age: 18,
    gender: "male",
    extraInfo: {
      height: 180,
      weight: 70,
    },
  });

  expect(store.getProp("name")).eq("test");
  expect(store.getProp("age")).eq(18);
  expect(store.getProp("gender")).eq("male");
  expect(store.getProp("extraInfo.height")).eq(180);
  expect(store.getProp("extraInfo.weight")).eq(70);
  
  const observableName = store.getObservableProp("name");
  const observableHeight = store.getObservableProp("extraInfo.height");
  
  let newNameValue: string | undefined;
  let newHeightValue: number | undefined;

  observableName.addObserver({
    onUpdate: (value) => {
      newNameValue = value;
    }
  });
  observableHeight.addObserver({
    onUpdate: (value) => {
      newHeightValue = value;
    }
  });
  expect(observableName.getCurrValue()).eq("test");
  expect(observableHeight.getCurrValue()).eq(180);

  store.replaceProp("name", "test2");
  store.replaceProp("extraInfo.height", 181);

  expect(observableName.getCurrValue()).eq("test2");
  expect(observableHeight.getCurrValue()).eq(181);
  expect(newNameValue).eq("test2");
  expect(newHeightValue).eq(181);
});