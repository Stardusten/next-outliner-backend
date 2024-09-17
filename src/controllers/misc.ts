import { FastifyInstance, FastifyPluginCallback } from "fastify";
import axios from "axios";
import * as he from "html-entities";
import { json } from "../utils/validation";

export const miscController = (fastify: FastifyInstance<any>) => {
  // fetch web title
  fastify.post(
    "/fetch-webpage-title",
    json({
      webpageUrl: { type: "string" },
    }),
    async (request, reply) => {
      if (!request.authorized) return fastify.NOT_AUTHORIZED;
      let { webpageUrl } = request.body as any;
      const inner = async (url: string) => {
        const resp = await axios.get(url, {
          responseType: "text",
          maxRedirects: 10,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        const regex = /<title(?:\s+[^>]*?)?>([^<>\n\r]+)<\/title>/;
        const match = regex.exec(resp.data);
        if (!match) return null;
        // decode html entities
        const content = match[1];
        return he.decode(content);
      };
      webpageUrl = webpageUrl.trim();
      const rawUrl = webpageUrl.startsWith("https://")
        ? webpageUrl.slice(8)
        : webpageUrl.startsWith("http://")
          ? webpageUrl.slice(7)
          : webpageUrl;
      const title =
        (await inner("https://" + rawUrl)) || (await inner("http://" + rawUrl));
      return { title };
    },
  );
};
