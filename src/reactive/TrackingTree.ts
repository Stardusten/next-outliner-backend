// 定义跟踪树上下文的类型
type TrackingTreeContext<T = any> = {
  connected: Set<T>;  // 存储连接到当前节点的对象
  children: Record<string, TrackingTreeContext>;  // 存储子节点
};

// 定义路径类型，可以是字符串或字符串/数字数组
// e.g. "a.b.c" or ["a", "b", "c"] or ["a", 1, "c"]
// 数字是索引，表示数组中的位置；字符串是对象 / Map 的属性
export type StringPath = string;
export type ArrayPath = (string | number)[];
export type TrackPath = StringPath | ArrayPath;

// 定义跟踪树类
export class TrackingTree<T = any> {
  private readonly trackedObjects: TrackingTreeContext<T>;

  constructor() {
    // 初始化根节点
    this.trackedObjects = {
      connected: new Set(),
      children: {},
    };
  }

  // 根据路径查找或创建上下文
  private __findContext(path: TrackPath): TrackingTreeContext<T> {
    path = typeof path == "string" ? path.split(".") : path;
    let context = this.trackedObjects;
    for (const seg of path) {
      if (context.children[seg] == null) {
        // 如果路径段不存在，创建新的上下文
        context.children[seg] = {
          connected: new Set(),
          children: {},
        };
      }
      context = context.children[seg];
    }
    return context;
  }

  // 在指定路径添加对象
  public addObject(path: TrackPath, object: T) {
    const context = this.__findContext(path);
    context.connected.add(object);
  }

  // 从指定路径移除对象
  public removeObject(path: TrackPath, object: T) {
    const context = this.__findContext(path);
    context.connected.delete(object);
  }

  // 获取受影响的路径及其连接的对象
  public getAffectedPaths(paths: Iterable<TrackPath>): Map<string, Set<T>> {
    const affected = new Map<string, Set<T>>();
    for (const path of paths) {
      let context = this.trackedObjects;
      let contextPath: (string | number)[] = [];
      // 从根到路径末尾，一路上所有路径都受影响
      for (let i = 0; i < path.length - 1; i++) {
        const seg = path[i];
        context = context.children[seg];
        contextPath.push(seg);
        if (context == null) return affected;
        affected.set(contextPath.join("."), context.connected);
      }
      // 路径末尾节点为根的子树都受影响
      const dfs = (rootContext: TrackingTreeContext, rootContextPath: (string | number)[]) => {
        affected.set(rootContextPath.join("."), rootContext.connected);
        for (const seg in rootContext.children) {
          dfs(rootContext.children[seg], [...rootContextPath, seg]);
        }
      };
      const lastSeg = path[path.length - 1];
      if (context.children[lastSeg] == null) return affected;
      dfs(context.children[lastSeg], [...contextPath, lastSeg]);
    }

    return affected;
  }
}