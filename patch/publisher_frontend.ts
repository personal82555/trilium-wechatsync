import { registerPublisher, getRegisteredPublishers, parsePlatformConfigs, extractArticleContent, publishToPlatforms } from "../../services/publisher/core.js";
import { WechatSyncPublisher } from "../../services/publisher/wechatsync.js";
import type { PlatformConfig } from "../../services/publisher/types.js";
import type { Request } from "express";
import { getOptionOrNull } from "../../services/options.js";

export function registerPublisherApi(
    apiRoute: Function,
    asyncApiRoute: Function,
    asyncRoute: Function
) {
    apiRoute("get", "/api/publisher/registered", () => ({ publishers: getRegisteredPublishers() }));
    apiRoute("get", "/api/publisher/platforms", () => ({ platforms: parsePlatformConfigs(getOptionOrNull("publisherConfigs") || undefined) }));

    // Status endpoint: bridge health + extension connection
    apiRoute("get", "/api/publisher/status", async () => {
        const bridge = await WechatSyncPublisher.checkBridge();
        return {
            bridge,
            wechatsync: { installed: true }
        };
    });

    asyncRoute("post", "/api/publisher/platforms", [], async (req: Request) => {
        const { platforms } = req.body as { platforms: PlatformConfig[] };
        return { platforms: platforms ? parsePlatformConfigs(JSON.stringify(platforms)) : [] };
    });

    apiRoute("get", "/api/publisher/notes-with-children/:noteId", (req: Request) => {
        const note = getNote(req.params.noteId);
        if (!note) return { error: "Note not found" };
        return { note: note.getPojoWithAttributes(), children: note.getChildNotes().map(c => c.getPojoWithAttributes()) };
    });

    asyncRoute("post", "/api/publisher/publish", [], async (req: Request) => {
        const { noteId, platformIds } = req.body as { noteId: string; platformIds: string[] };
        if (!noteId || !platformIds?.length) return { error: "Missing noteId or platformIds" };

        const article = extractArticleContent(noteId);
        if (!article) return { error: "Article not found or empty" };

        const configs = parsePlatformConfigs(getOptionOrNull("publisherConfigs") || "");
        if (!configs?.length) return { error: "No platforms configured" };

        const selected = configs.filter(c => platformIds.includes(c.id));
        const results = await Promise.all(selected.map(async cfg => {
            const publishers = getRegisteredPublishers();
            for (const pub of publishers) {
                if (pub.id === cfg.platform) {
                    return { config: cfg, result: await pub.publish(article, cfg) };
                }
            }
            return { config: cfg, result: { platform: cfg.platform, platformName: cfg.name, status: "failed", errorMessage: "Publisher not found", publishedAt: new Date().toISOString() } };
        }));

        return { results: results.map(r => r.result) };
    });
}

function getNote(noteId: string) {
    const becca = (global as any).becca;
    return becca?.getNote(noteId);
}
