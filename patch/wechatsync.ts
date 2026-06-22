import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { getLog } from "@triliumnext/core";
import type { Publisher, PlatformConfig, ArticleContent, PublishResult } from "./types.js";

const BRIDGE_HTTP = 9601;

export class WechatSyncPublisher implements Publisher {
    readonly id = "wechatsync" as const;
    readonly name = "WechatSync 文章同步助手";
    readonly icon = "bxl-wechat";

    async validateConfig(c: PlatformConfig): Promise<{valid: boolean; message?: string}> {
        const dir = c.config.outputDir || path.join(os.homedir(), "wechatsync", "articles");
        try { fs.mkdirSync(dir, { recursive: true }); return {valid: true, message: "目录可写: " + dir}; }
        catch(e: any) { return {valid: false, message: e.message}; }
    }

    /** 检测桥接是否在线 + 扩展是否连接 */
    static async checkBridge(): Promise<{online: boolean; extensionConnected: boolean; error?: string}> {
        try {
            const resp = await fetch(`http://localhost:${BRIDGE_HTTP}/status`);
            if (!resp.ok) return {online: false, extensionConnected: false, error: `HTTP ${resp.status}`};
            const data = await resp.json() as any;
            return {online: true, extensionConnected: data.connected === true, error: undefined};
        } catch(e: any) {
            return {online: false, extensionConnected: false, error: e.message || "bridge unreachable"};
        }
    }

    async publish(article: ArticleContent, config: PlatformConfig): Promise<PublishResult> {
        const outputDir = config.config.outputDir || path.join(os.homedir(), "wechatsync", "articles");
        const log = getLog();
        try {
            fs.mkdirSync(outputDir, { recursive: true });
            const md = this.toMarkdown(article);
            const safeName = article.title.replace(/[<>:\/\\|?*]/g, "_").substring(0, 80);
            const fp = path.join(outputDir, safeName + "-" + Date.now() + ".md");
            fs.writeFileSync(fp, md, "utf-8");
            log.info("WechatSync: 导出 → " + fp);

            // Retry: extension may reconnect briefly
            const MAX_RETRIES = 5;
            let platformUrl = "";
            let lastError = "";

            for (let retry = 0; retry < MAX_RETRIES && !platformUrl; retry++) {
                const bridge = await WechatSyncPublisher.checkBridge();
                if (!bridge.online) {
                    return {platform: this.id, platformName: config.name, status: "failed",
                        errorMessage: "Bridge HTTP API offline (localhost:9601)", publishedAt: new Date().toISOString()};
                }
                if (!bridge.extensionConnected) {
                    if (retry < 2) {
                        log.info(`WechatSync: waiting for extension... (${retry + 1}/${MAX_RETRIES})`);
                        await new Promise(r => setTimeout(r, 3000));
                        continue;
                    }
                    return {platform: this.id, platformName: config.name, status: "failed",
                        errorMessage: "Extension not connected (waited " + (retry * 3) + "s)", publishedAt: new Date().toISOString()};
                }

                try {
                    const pa = config.config.platforms ? "--platforms " + config.config.platforms : "";
                    const cmd = "wechatsync sync \"" + fp + "\" " + pa;
                    const out = execSync(cmd, {timeout: 30000, stdio: ["pipe", "pipe", "pipe"],
                        env: {...process.env, SYNC_WS_PORT: "9600"}}).toString();
                    platformUrl = this.extractDraftUrl(out);
                    log.info("CLI output: " + out.substring(0, 500));
                } catch(cliError: any) {
                    const all = (cliError.stdout || "") + "\n" + (cliError.stderr || "");
                    platformUrl = this.extractDraftUrl(all);
                    lastError = all.substring(0, 200);
                    log.info("CLI(stderr): " + all.substring(0, 500));
                }

                if (!platformUrl && retry < MAX_RETRIES - 1) {
                    log.info(`WechatSync: no URL found, retry ${retry + 1}/${MAX_RETRIES}...`);
                    await new Promise(r => setTimeout(r, 3000));
                }
            }

            return {
                platform: this.id, platformName: config.name,
                status: platformUrl ? "success" : "failed",
                url: platformUrl || undefined,
                errorMessage: platformUrl ? undefined : (lastError || "No URL returned, extension may be disconnected"),
                publishedAt: new Date().toISOString()
            };
        } catch(e: any) {
            return {platform: this.id, platformName: config.name, status: "failed", errorMessage: e.message, publishedAt: new Date().toISOString()};
        }
    }

    /** Extract draft edit URLs from CLI output, skip image URLs */
    private extractDraftUrl(text: string): string {
        const allUrls: string[] = [];
        const re = /https?:\/\/[^\s"<>)\]]+/g;
        let m;
        while ((m = re.exec(text)) !== null) allUrls.push(m[0]);

        const skipDomains = /(img\.88531\.cn|i\.loli\.net|imgchr\.com|\.(?:png|jpg|jpeg|gif|webp|svg|ico)(?:\?|$))/i;

        const draftPatterns = [
            /mp\.weixin\.qq\.com\/cgi-bin\/appmsg/,
            /mp\.csdn\.net\/mp_blog\/creation/,
            /zhuanlan\.zhihu\.com\/p\//,
            /mp\.toutiao\.com\/profile_v4\//,
            /zhiyou\.smzdm\.com\/member\//,
            /juejin\.cn\/editor\/drafts\//,
            /segmentfault\.com\/\w+\/drafts/,
            /weibo\.com\/ttarticle\/p\//,
            /mp\.weixin\.qq\.com\/s\//,
        ];

        for (const url of allUrls) {
            for (const pat of draftPatterns) {
                if (pat.test(url)) return url;
            }
        }

        for (const url of allUrls) {
            if (!skipDomains.test(url)) return url;
        }

        return "";
    }

    private toMarkdown(article: ArticleContent): string {
        const lines = ["---", "title: \"" + article.title + "\"", "---\n"];
        let md = article.content
            .replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, "![image]($1)")
            .replace(/<h2[^>]*>/gi, "## ").replace(/<\/h2>/gi, "\n\n")
            .replace(/<h3[^>]*>/gi, "### ").replace(/<\/h3>/gi, "\n\n")
            .replace(/<p[^>]*>/gi, "").replace(/<\/p>/gi, "\n\n")
            .replace(/<strong>/gi, "**").replace(/<\/strong>/gi, "**")
            .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
            .replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")
            .replace(/\n{3,}/g, "\n\n").trim();
        return lines.join("\n") + md;
    }
}
