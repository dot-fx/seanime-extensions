/// <reference path="../online-streaming-provider.d.ts" />

class Provider {
    api = "https://common.anidream.cc/v1"

    getSettings(): Settings {
        return {
            episodeServers: ["Default", "Zen"],
            supportsDub: true,
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const res = await fetch(`${this.api}/search?pageSize=8&query=${encodeURIComponent(opts.query)}`, {
            headers: {
                "accept": "*/*",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            },
        });

        const json = await res.json();
        const series = json?.data?.series ?? [];

        return series.map((s: any) => ({
            id: s.id,
            title: s.title,
            url: `https://anidream.cc/series/${s.slug}`,
            subOrDub: "sub",
        }));
    }

    async findEpisodes(showId: string): Promise<EpisodeDetails[]> {
        const res = await fetch(`https://common.anidream.cc/v1/series/${showId}`, {
            headers: {
                "accept": "application/json, text/javascript, */*; q=0.01",
                "accept-language": "es-ES,es;q=0.9",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "referer": "https://anidream.cc/",
            },
        });

        if (!res.ok) throw new Error(`Error HTTP ${res.status}`);

        const json = await res.json();

        const episodes = json?.data?.episodes

        if (!Array.isArray(episodes)) return [];

        return episodes.map((ep: any) => ({
            id: ep.id,
            number: parseInt(ep.number, 10),
            title: ep.title,
            url: `https://anidream.cc/watch/${ep.slug}`,
        }));
    }

    parseSubtitles(data: any): VideoSubtitle[] {
        if (!data || !Array.isArray(data.subtitles)) return [];

        return data.subtitles.map((s: any) => {
            const cleanLang = (s.language_name ?? "")
                .replace(/^Language\s*\(|\)$/g, "") // quita "Language (" y ")"
                .trim();

            return {
                id: cleanLang,
                url: s.url,
                language: `${cleanLang} - ${s.title ?? ""}`,
                isDefault: s.is_default ?? false,
            };
        });
    }


    async findEpisodeServer(episodeOrId: any, serverName: string): Promise<EpisodeServer> {
        const headers = {
            "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            "accept": "*/*",
        };

        // 🔹 Default server
        if (serverName.toLowerCase() === "default") {
            const res = await fetch(`${this.api}/watch/default/${episodeOrId.id}/`, { headers });
            const json = await res.json();

            if (!json?.data?.m3u8_url) throw new Error("Stream not found at Default");

            return {
                server: "Default",
                headers: {},
                videoSources: [
                    {
                        url: json.data.m3u8_url,
                        type: "m3u8",
                        quality: "auto",
                        subtitles: json.data?.subtitles?.length ? this.parseSubtitles(json.data) : [],
                    },
                ],
            };
        }

        // 🔹 Other servers (e.g., Zen)
        const res = await fetch(`${this.api}/episodes/${episodeOrId.id}/`, { headers });
        const json = await res.json();
        const servers = json?.data?.servers ?? [];

        const target = servers.find((s: any) => s.server.toLowerCase() === serverName.toLowerCase());
        if (!target?.access_id) throw new Error(`Server ${serverName} not found`);

        const res2 = await fetch(`${this.api}/watch/${serverName}/${target.access_id}/`, { headers });
        const json2 = await res2.json();

        if (!json2?.data?.m3u8_url) throw new Error(`Stream not found on ${serverName}`);

        return {
            server: serverName,
            headers: {},
            videoSources: [
                {
                    url: json2.data.m3u8_url,
                    type: "m3u8",
                    quality: "auto",
                    subtitles: json2.data?.subtitles?.length ? this.parseSubtitles(json2.data) : [],
                },
            ],
        };
    }
}