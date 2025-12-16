/// <reference path="../online-streaming-provider.d.ts" />

class Provider {
    api = "https://anizone.to"

    getSettings(): Settings {
        return {
            episodeServers: ["HLS"],
            supportsDub: true,
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const res = await fetch(`${this.api}/anime?search=${encodeURIComponent(opts.query)}`, {
            headers: {
                "accept": "*/*",
                "accept-language": "es-ES,es;q=0.9",
                "referer": "https://anizone.to/",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            },
        });

        const html = await res.text();

        const itemRegex = /<div[^>]*class="relative overflow-hidden h-26 rounded-lg[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"[\s\S]*?<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"/g;

        const results: SearchResult[] = [];
        let match;

        while ((match = itemRegex.exec(html)) !== null) {
            const [, image, altTitle, href, title] = match;
            const animeId = href.split("/").pop() ?? "";

            // Scrape del primer episodio para determinar subOrDub
            const episodeHtml = await fetch(`${this.api}/anime/${animeId}/1`, {
                headers: {
                    "accept": "*/*",
                    "referer": "https://anizone.to/",
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
                },
            }).then(r => r.text());

            let subOrDub: SubOrDub = "sub"; // default

            const audioMatch = episodeHtml.match(/<div class="text-xs flex flex-wrap gap-1">([\s\S]*?)<\/div>/);
            if (audioMatch) {
                const audioHtml = audioMatch[1];
                const hasJapanese = /Japanese/.test(audioHtml);
                const hasOther = /(English|Spanish|French|German|Italian)/.test(audioHtml);

                if (hasJapanese && hasOther) subOrDub = "both";
                else if (hasOther) subOrDub = "dub";
                else subOrDub = "sub";
            }

            results.push({
                id: animeId,
                title: title || altTitle,
                url: href,
                subOrDub,
            });
        }

        return results;
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const html = await fetch(`${this.api}/anime/${id}/1`).then(r => r.text());

        const regex = /<a[^>]*href="([^"]*\/anime\/[^"]+?)"[^>]*>\s*<div[^>]*>\s*<div[^>]*class='[^']*min-w-10[^']*'[^>]*>(\d+)<\/div>\s*<div[^>]*class="[^"]*line-clamp-1[^"]*"[^>]*>([^<]+)<\/div>/g;

        const episodes: EpisodeDetails[] = [];
        let match;

        while ((match = regex.exec(html)) !== null) {
            const [, href, num, title] = match;
            episodes.push({
                id: href.split("/").pop() ?? num,
                number: parseInt(num, 10),
                url: href,
                title: title.trim(),
            });
        }

        return episodes;
    }

    async findEpisodeServer(episodeOrId: any, _server: string): Promise<EpisodeServer> {
        const html = await fetch(episodeOrId.url).then(r => r.text());

        // obtener el .m3u8 principal
        const srcMatch = html.match(/<media-player[^>]+src="([^"]+\.m3u8)"[^>]*>/i);
        if (!srcMatch) throw new Error("No se encontró el enlace .m3u8 en la página.");
        const masterUrl = srcMatch[1];

        // usar master directamente para conservar las pistas de audio
        const m3u8 = await fetch(masterUrl).then(r => r.text());
        const baseUrl = masterUrl.split("/").slice(0, -1).join("/");

        // extraer resoluciones (solo para mostrar calidades)
        const sources: { url: string; quality: string }[] = [];
        const regex = /#EXT-X-STREAM-INF:[^\n]*RESOLUTION=\d+x(\d+)/g;
        let match;
        while ((match = regex.exec(m3u8)) !== null) {
            const [, height] = match;
            sources.push({ url: masterUrl, quality: `${height}p` });
        }

        if (sources.length === 0) {
            sources.push({ url: masterUrl, quality: "auto" });
        }

        const trackRegex = /<track[^>]+src=([^ >]+)[^>]*label="([^"]+)"[^>]*srclang="([^"]+)"[^>]*(default)?/gi;
        const subtitles: VideoSubtitle[] = [];

        while ((match = trackRegex.exec(html)) !== null) {
            const [, src, label, lang, isDefault] = match;

            subtitles.push({
                id: lang,
                url: src,
                language: label
                    .replace(/_/g, " ")
                    .replace(/\[(.*?)]/g, "($1)")
                    .replace(/\s+/g, " ")
                    .trim(),
                isDefault: Boolean(isDefault),
            });
        }

        return {
            server: _server,
            headers: {
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.9",
                "Origin": "https://anizone.to",
                "Referer": "https://anizone.to/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            },
            videoSources: sources.map(s => ({
                url: masterUrl,
                type: "m3u8" as VideoSourceType,
                quality: s.quality,
                subtitles,
            })),
        };
    }
}
