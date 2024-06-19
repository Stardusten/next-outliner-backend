import Database from "better-sqlite3";
import os from "os";
import path from "node:path";

export type BlockId = string;

export type NormalBlock = {
  id: BlockId;
  type: 0;
  parent: BlockId;
  childrenIds: BlockId[];
  fold: boolean;
  content: BlockContent;
  ctext: string;
  metadata: Record<string, any>;
  mtext: string;
  olinks: BlockId[];
  boosting: number;
};

export type MirrorBlock = {
  id: BlockId;
  type: 1;
  parent: BlockId;
  childrenIds: BlockId[]; // mirror block 的子块只能是 virtual block
  fold: boolean;
  // 只可能是 normal block
  src: BlockId;
};

export type VirtualBlock = {
  id: BlockId;
  type: 2;
  parent: BlockId;
  // virtual block 的子块只能是 virtual block 或者 "null"
  // "null" 表示这个 virtual block 的子块还没被创建，用于防止无限递归
  childrenIds: BlockId[] | "null";
  fold: boolean;
  // 可能是 normal block 或者 mirror block
  src: BlockId;
};

export type Block = NormalBlock | MirrorBlock | VirtualBlock;

// Augmented Block
export type ABlock = ANormalBlock | AMirrorBlock | AVirtualBlock;

export type APart = {
  actualSrc: BlockId;
  content: BlockContent;
  ctext: string;
  metadata: Record<string, any>;
  mtext: string;
  olinks: BlockId[];
  boosting: number;
};

export type ANormalBlock = NormalBlock & APart;

export type AMirrorBlock = MirrorBlock & APart;

export type AVirtualBlock = VirtualBlock & APart;

export const isNormalBlock = (
  block: Block | ABlock | undefined | null,
): block is NormalBlock => {
  return block != null && block.type == 0;
};

export const isMirrorBlock = (
  block: Block | ABlock | undefined | null,
): block is MirrorBlock => {
  return block != null && block.type == 1;
};

export const isVirtualBlock = (
  block: Block | ABlock | undefined | null,
): block is VirtualBlock => {
  return block != null && block.type == 2;
};

///////////////

export type BlockContent =
  | TextContent
  | ImageContent
  | CodeContent
  | MathDisplayContent;

export type TextContent = {
  type: "text";
  docContent: any;
};

export type ImageContent = {
  type: "image";
  path: string;
  absolute?: boolean;
  width?: number;
};

export type CodeContent = {
  type: "code";
  code: string;
  lang: string;
};

export type MathDisplayContent = {
  type: "mathDisplay";
  src: string;
};

export const mkDbConn = async (dbPath: string) => {
  // 打开数据库连接
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  if (!db.open) {
    throw new Error(`Failed to open database ${dbPath}`);
  }

  // 加载插件
  const platform = os
    .platform()
    .toLowerCase()
    .replace(/[0-9]/g, ``)
    .replace(`darwin`, `macos`) as "win" | "linux" | "macos";

  const resourcesFolder = platform == "linux" ? "linux_x64" : "windows_x64";

  const extensionPath = path.join(
    process.cwd(),
    "resources",
    resourcesFolder,
    platform == "win" ? "simple.dll" : "libsimple.so",
  );
  db.loadExtension(extensionPath);

  const getAllBlocks = () => {
    const blocks = db.prepare("SELECT * FROM blocks").all() as any[];
    return blocks.map((block) => {
      block["fold"] = block["fold"] != 0;
      block["childrenIds"] = JSON.parse(block["childrenIds"]);
      block["content"] = JSON.parse(block["content"]);
      block["metadata"] = JSON.parse(block["metadata"]);
      block["olinks"] = block["olinks"]
        ? JSON.parse(block["olinks"]) ?? []
        : [];
      return block;
    }) as Block[];
  };

  const getOneBlock = (blockId: BlockId) => {
    const block: any = db
      .prepare("SELECT * FROM blocks b WHERE b.id = ?")
      .get(blockId);
    if (!block) return null;
    block["fold"] = block["fold"] != 0;
    block["childrenIds"] = JSON.parse(block["childrenIds"]);
    block["content"] = JSON.parse(block["content"]);
    block["metadata"] = JSON.parse(block["metadata"]);
    block["olinks"] = block["olinks"] ? JSON.parse(block["olinks"]) ?? [] : [];
    return block;
  };

  const putBlocks = (blocks: Block[]) => {
    for (const block of blocks) {
      const params = {
        id: block.id,
        parent: block.parent,
        type: block.type,
        childrenIds: JSON.stringify(block.childrenIds),
        fold: block.fold ? 1 : 0,
        content: "content" in block ? JSON.stringify(block.content) : null,
        ctext: "ctext" in block ? block.ctext : null,
        metadata: "metadata" in block ? JSON.stringify(block.metadata) : null,
        mtext: "mtext" in block ? block.mtext : null,
        src: "src" in block ? block.src : null,
        olinks: "olinks" in block ? JSON.stringify(block.olinks) : null,
        boosting: "boosting" in block ? JSON.stringify(block.boosting) : null,
      };
      const sql = db!
        .prepare(
          `
        INSERT INTO blocks
        VALUES(@id, @parent, @type, @childrenIds, @fold, @content, @ctext, @metadata, @mtext, @src, @olinks, @boosting)
        ON CONFLICT(id) DO UPDATE SET
        id=@id, parent=@parent, type=@type, childrenIds=@childrenIds, fold=@fold, content=@content,
        ctext=@ctext, metadata=@metadata, mtext=@mtext, src=@src, olinks=@olinks, boosting=@boosting;
      `,
        )
        .bind(params);
      sql.run();
    }
  };

  const deleteBlocks = (blockIds: BlockId[]) => {
    for (const id of blockIds) {
      db.prepare("DELETE FROM blocks WHERE id = ?").run(id);
    }
  };

  const getKV = (key: string) => {
    const value = db
      .prepare("SELECT value FROM misc WHERE key = ?")
      .get(key) as any;
    return JSON.parse(value ?? null);
  };

  const getAllKVs = () => {
    const miscs = db.prepare("SELECT key, value FROM misc").all() as any;
    return miscs.map((obj: any) => {
      obj.value = JSON.parse(obj.value ?? null);
      return obj;
    });
  };

  const putKV = (key: string, value: any) => {
    db.prepare(
      `
        INSERT INTO misc VALUES (@key, @value)
        ON CONFLICT(key) DO UPDATE SET
        key=@key, value=@value;
      `,
    ).run({ key, value: JSON.stringify(value) });
  };

  const deleteKV = (key: string) => {
    db.prepare('DELETE FROM misc WHERE "key"=?').run(key);
  };

  const rebuildSearchIndex = () => {
    db.exec(`
    -- 删除已有的索引表和触发器
    DROP TABLE IF EXISTS blocks_fts_idx;
    DROP TRIGGER IF EXISTS blocks_ai;
    DROP TRIGGER IF EXISTS blocks_ad;
    DROP TRIGGER IF EXISTS blocks_au1;
    DROP TRIGGER IF EXISTS blocks_au2;
    
    -- 创建新的索引表和触发器
    CREATE VIRTUAL TABLE blocks_fts_idx USING fts5(ctext, mtext, tokenize = 'simple 0');
      CREATE TRIGGER blocks_ai AFTER INSERT ON blocks
      WHEN new.src ISNULL BEGIN -- only trigger for normal block
        INSERT INTO blocks_fts_idx(rowid, ctext, mtext) VALUES (new.rowid, new.ctext, new.mtext);
      END;
      CREATE TRIGGER blocks_ad AFTER DELETE ON blocks BEGIN
        DELETE FROM blocks_fts_idx WHERE rowid = old.rowid;
      END;
      CREATE TRIGGER blocks_au1 AFTER UPDATE ON blocks
      WHEN new.src NOTNULL BEGIN
        DELETE FROM blocks_fts_idx WHERE rowid = old.rowid;
      END;
      CREATE TRIGGER blocks_au2 AFTER UPDATE ON blocks
      WHEN new.src ISNULL BEGIN -- trigger for normal block
        DELETE FROM blocks_fts_idx WHERE rowid = old.rowid;
        INSERT INTO blocks_fts_idx(rowid, ctext, mtext) VALUES (new.rowid, new.ctext, new.mtext);
      END;
      INSERT INTO blocks_fts_idx (rowid, ctext, mtext)
      SELECT rowid, ctext, mtext
      FROM blocks
      WHERE src ISNULL;
  `);
  };

  const close = () => {
    db.close();
  };

  return {
    close,
    getAllBlocks,
    getOneBlock,
    putBlocks,
    deleteBlocks,
    getKV,
    getAllKVs,
    putKV,
    deleteKV,
    rebuildSearchIndex,
  };
};

export type DbConn = Awaited<ReturnType<typeof mkDbConn>>;
