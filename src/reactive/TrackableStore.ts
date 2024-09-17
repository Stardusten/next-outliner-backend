import mitt, { Emitter } from "mitt";
import { TrackPath, ArrayPath, TrackingTree } from "./TrackingTree";
import { createObservable, Observable } from "./Observable";

/**
 * 定义追踪补丁的类型
 * @template M 元数据类型
 * @template V 值类型
 */
export type TrackPatch<M = {}, V = any> = {
  op: "replace" | "remove" | "add";
  path: ArrayPath;
  value?: V;
  // op == "add" 时，oldValue 为 undefined
  // op == "replace" 时，旧的值会被赋给 oldValue
  // op == "remove" 时，在 apply 后被删除的元素会被赋给 oldValue
  oldValue?: V;
  meta?: M;
};

/**
 * 定义追踪事件映射
 */
export type TrackingEventMap = {
  afterPatches: [TrackPatch[]]; // 补丁应用后的事件
};

/**
 * 可追踪存储类
 * @template PROPS 属性类型
 * @template PATCH 补丁类型
 */
export class TrackableStore<PROPS = any, PATCH extends TrackPatch = TrackPatch> {
  private readonly props: PROPS; // 存储的属性
  private readonly trackingTree: TrackingTree<Observable<any>>; // 追踪树
  private readonly emitter: Emitter<TrackingEventMap>; // 事件发射器

  /**
   * 构造函数
   * @param props 初始属性
   */
  constructor(props: PROPS) {
    this.props = props;
    this.trackingTree = new TrackingTree();
    this.emitter = mitt<TrackingEventMap>();
  }

  /**
   * 应用补丁
   * @param patches 补丁数组
   */
  public applyPatches(patches: PATCH[]) {
    const inversePatches: PATCH[] = [];
    const changedPaths: ArrayPath[] = [];

    for (const patch of patches) {
      const { op, path, value } = patch;
      if (path.length === 0) {
        console.warn("Path cannot be empty");
        continue;
      }

      let current = this.props as any;
      for (let i = 0; i < path.length - 1; i++) {
        const part = path[i];
        if (current instanceof Map) {
          if (!current.has(part)) {
            current.set(part, typeof path[i + 1] === "number" ? [] : {});
          }
          current = current.get(part);
        } else if (current instanceof Set) {
          console.warn("Cannot navigate inside a Set as it does not have keys");
          break;
        } else {
          if (!(part in current)) {
            if (op === "add") {
              current[part] = typeof path[i + 1] === "number" ? [] : {};
            } else {
              console.warn("Invalid path: ", path.join("/"));
              break;
            }
          }
          current = current[part];
        }
      }

      // 执行更新
      const lastKey = path[path.length - 1];
      let oldValue;
      if (current instanceof Map) {
        oldValue = structuredClone(current.get(lastKey));
        changedPaths.push(path);
        switch (op) {
          case "replace":
            inversePatches.push({ op: "replace", path, value: oldValue } as PATCH);
            current.set(lastKey, value);
            patch.oldValue = oldValue;
            break;
          case "add":
            if (current.has(lastKey)) {
              inversePatches.push({ op: "replace", path, value: oldValue } as PATCH);
            } else {
              inversePatches.push({ op: "remove", path } as PATCH);
            }
            current.set(lastKey, value);
            break;
          case "remove":
            inversePatches.push({ op: "add", path, value: oldValue } as PATCH);
            patch.oldValue = oldValue; // 将被删除的元素放到 patch.oldValue
            current.delete(lastKey);
            break;
          default:
            console.warn("Unsupported operation for Map: ", op);
        }
      } else if (current instanceof Set) {
        changedPaths.push(path.slice(0, path.length - 1));
        if (op === "add") {
          if (!current.has(value)) {
            inversePatches.push({ op: "remove", path, value } as PATCH);
          }
          current.add(value);
        } else if (op === "remove") {
          if (current.has(value)) {
            inversePatches.push({ op: "add", path, value } as PATCH);
          }
          current.delete(lastKey); // TODO: 需要确认这里是否应该使用 lastKey
        } else {
          console.warn("Unsupported operation for Set: ", op);
        }
      } else {
        // 数组或对象
        oldValue = structuredClone(current[lastKey]);
        changedPaths.push(path);
        switch (op) {
          case "replace":
            inversePatches.push({ op: "replace", path, value: oldValue } as PATCH);
            current[lastKey] = value;
            patch.oldValue = oldValue;
            break;
          case "add":
            if (Array.isArray(current)) {
              if (typeof lastKey === "number") {
                inversePatches.push({ op: "remove", path } as PATCH);
                current.splice(lastKey, 0, value);
              } else {
                console.warn("Invalid index for array: ", lastKey);
              }
            } else {
              if (lastKey in current) {
                inversePatches.push({ op: "replace", path, value: oldValue } as PATCH);
              } else {
                inversePatches.push({ op: "remove", path } as PATCH);
              }
              current[lastKey] = value;
            }
            break;
          case "remove":
            if (Array.isArray(current)) {
              if (typeof lastKey === "number") {
                inversePatches.push({ op: "add", path, value: oldValue } as PATCH);
                current.splice(lastKey, 1);
              } else {
                console.warn("Invalid index for array: ", lastKey);
              }
            } else {
              inversePatches.push({ op: "add", path, value: oldValue } as PATCH);
              delete current[lastKey];
            }
            patch.oldValue = oldValue;
            break;
          default:
            console.warn("Unsupported operation: ", op);
        }
      }
    }

    // 更新所有受影响的响应式变量
    const affected = this.trackingTree.getAffectedPaths(changedPaths);
    for (const [path, objs] of affected.entries()) {
      const newValue = this.getProp(path);
      for (const obj of objs) {
        obj.update(newValue);
      }
    }

    this.emitter.emit("afterPatches", [patches]);
  }

  /**
   * 获取属性值
   * @param path 属性路径
   * @returns 属性值
   */
  public getProp(path: TrackPath) {
    const arrayPath = typeof path == "string" ? path.split(".") : path;
    let current = this.props as any;
    for (let i = 0; i < arrayPath.length - 1; i++) {
      const part = arrayPath[i];
      if (current instanceof Map) {
        if (!current.has(part)) return null;
        current = current.get(part);
      } else if (current instanceof Set) {
        return null;
      } else {
        if (!(part in current)) return null;
        current = current[part];
      }
    }

    if (current == null) return null;
    const lastKey = arrayPath[arrayPath.length - 1];
    if (current instanceof Map) return current.get(lastKey);
    else return current[lastKey];
  }

  /**
   * 获取可观察的属性
   * @param path 属性路径
   * @returns 可观察对象
   */
  public getObservableProp(path: TrackPath) {
    const currentValue = this.getProp(path);
    const observable = createObservable(currentValue);
    this.trackingTree.addObject(path, observable);
    return observable;
  }

  /**
   * 添加追踪属性
   * @param path 属性路径
   * @param value 属性值
   */
  public addProp(path: TrackPath, value: any) {
    const arrayPath = typeof path == "string" ? path.split(".") : path;
    this.applyPatches([{
      op: "add",
      path: arrayPath,
      value,
    } as PATCH]);
  }

  /**
   * 替换追踪属性
   * @param path 属性路径
   * @param value 新属性值
   */
  public replaceProp(path: TrackPath, value: any) {
    const arrayPath = typeof path == "string" ? path.split(".") : path;
    this.applyPatches([{
      op: "replace",
      path: arrayPath,
      value,
    } as PATCH]);
  }
  
  /**
   * 移除追踪属性
   * @param path 属性路径
   */
  public removeProp(path: TrackPath) {
    const arrayPath = typeof path == "string" ? path.split(".") : path;
    this.applyPatches([{
      op: "remove",
      path: arrayPath,
    } as PATCH]);
  }
}