import { it, expect } from "vitest";
import { config } from "../config";

it("test-config", async () => {
  const config1 = config.getCurrValue();
  expect(config1.host).toBe("0.0.0.0");
  expect(config1.port).toBe(8081)
  expect(config1.databases).eq({
    "/home/stardust/Downloads/notes": {
      name: "Stardust's Wiki",
      location: "/home/stardust/Downloads/notes",
      attachmentsDir: "attachments",
      imagesDir: "attachments/images",
      musicDir: "attachments/music",
      videoDir: "attachments/video",
      documentDir: "attachments/document",
    },
    "/home/stardust/Downloads/demodb": {
      name: "Demo Database",
      location: "/home/stardust/Downloads/demodb",
      attachmentsDir: "attachments",
      imagesDir: "attachments/images",
      musicDir: "attachments/music",
      videoDir: "attachments/video",
      documentDir: "attachments/document",
    }
  })
});