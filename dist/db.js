"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mkDbConn = exports.isVirtualBlock = exports.isMirrorBlock = exports.isNormalBlock = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const os_1 = __importDefault(require("os"));
const node_path_1 = __importDefault(require("node:path"));
const isNormalBlock = (block) => {
    return block != null && block.type == 0;
};
exports.isNormalBlock = isNormalBlock;
const isMirrorBlock = (block) => {
    return block != null && block.type == 1;
};
exports.isMirrorBlock = isMirrorBlock;
const isVirtualBlock = (block) => {
    return block != null && block.type == 2;
};
exports.isVirtualBlock = isVirtualBlock;
const mkDbConn = async (dbPath) => {
    // 打开数据库连接
    const db = new better_sqlite3_1.default(dbPath);
    db.pragma("journal_mode = WAL");
    if (!db.open) {
        throw new Error(`Failed to open database ${dbPath}`);
    }
    // 加载插件
    const platform = os_1.default
        .platform()
        .toLowerCase()
        .replace(/[0-9]/g, ``)
        .replace(`darwin`, `macos`);
    const resourcesFolder = platform == "linux" ? "linux_x64" : "windows_x64";
    const extensionPath = node_path_1.default.join(process.cwd(), "resources", resourcesFolder, platform == "win" ? "simple.dll" : "libsimple.so");
    db.loadExtension(extensionPath);
    const getAllBlocks = () => {
        const blocks = db.prepare("SELECT * FROM blocks").all();
        return blocks.map((block) => {
            block["fold"] = block["fold"] != 0;
            block["childrenIds"] = JSON.parse(block["childrenIds"]);
            block["content"] = JSON.parse(block["content"]);
            block["metadata"] = JSON.parse(block["metadata"]);
            block["olinks"] = block["olinks"]
                ? JSON.parse(block["olinks"]) ?? []
                : [];
            return block;
        });
    };
    const getOneBlock = (blockId) => {
        const block = db
            .prepare("SELECT * FROM blocks b WHERE b.id = ?")
            .get(blockId);
        if (!block)
            return null;
        block["fold"] = block["fold"] != 0;
        block["childrenIds"] = JSON.parse(block["childrenIds"]);
        block["content"] = JSON.parse(block["content"]);
        block["metadata"] = JSON.parse(block["metadata"]);
        block["olinks"] = block["olinks"] ? JSON.parse(block["olinks"]) ?? [] : [];
        return block;
    };
    const putBlocks = (blocks) => {
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
            const sql = db
                .prepare(`
        INSERT INTO blocks
        VALUES(@id, @parent, @type, @childrenIds, @fold, @content, @ctext, @metadata, @mtext, @src, @olinks, @boosting)
        ON CONFLICT(id) DO UPDATE SET
        id=@id, parent=@parent, type=@type, childrenIds=@childrenIds, fold=@fold, content=@content,
        ctext=@ctext, metadata=@metadata, mtext=@mtext, src=@src, olinks=@olinks, boosting=@boosting;
      `)
                .bind(params);
            sql.run();
        }
    };
    const deleteBlocks = (blockIds) => {
        for (const id of blockIds) {
            db.prepare("DELETE FROM blocks WHERE id = ?").run(id);
        }
    };
    const getKV = (key) => {
        const value = db
            .prepare("SELECT value FROM misc WHERE key = ?")
            .get(key);
        return JSON.parse(value ?? null);
    };
    const getAllKVs = () => {
        const miscs = db.prepare("SELECT key, value FROM misc").all();
        return miscs.map((obj) => {
            obj.value = JSON.parse(obj.value ?? null);
            return obj;
        });
    };
    const putKV = (key, value) => {
        db.prepare(`
        INSERT INTO misc VALUES (@key, @value)
        ON CONFLICT(key) DO UPDATE SET
        key=@key, value=@value;
      `).run({ key, value: JSON.stringify(value) });
    };
    const deleteKV = (key) => {
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
exports.mkDbConn = mkDbConn;
//# sourceMappingURL=db.js.map