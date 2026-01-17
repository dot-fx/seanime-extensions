/// <reference path="../online-streaming-provider.d.ts" />

class Provider {

    api = "https://animeav1.com";

    getSettings(): Settings {
        return {
            episodeServers: ["HLS", "HLS-DUB"],
            supportsDub: true,
        };
    }

    async search(query: SearchOptions): Promise<SearchResult[]> {
        const res = await fetch(`${this.api}/api/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: query.query }),
        });

        if (!res.ok) return [];

        const data = await res.json();

        return data.map((anime: any) => ({
            id: anime.slug,
            title: anime.title,
            url: `${this.api}/anime/${anime.slug}`,
            subOrDub: "both",
        }));
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const html = await fetch(`${this.api}/media/${id}`).then(r => r.text());
        const parsed = this.parseSvelteData(html);

        const media = parsed.find((x: any) => x?.data?.media)?.data?.media;
        if (!media?.episodes) throw new Error("No se encontró media.episodes");

        return media.episodes.map((ep: any, i: number) => ({
            id: `${media.slug}$${ep.number ?? i + 1}`,
            number: ep.number ?? i + 1,
            title: ep.title ?? `Episode ${ep.number ?? i + 1}`,
            url: `${this.api}/media/${media.slug}/${ep.number ?? i + 1}`,
        }));
    }

    async findEpisodeServer(episodeOrId: any, _server: string): Promise<EpisodeServer> {
        const ep = typeof episodeOrId === "string"
            ? (() => { try { return JSON.parse(episodeOrId); } catch { return { id: episodeOrId }; } })()
            : episodeOrId;

        const pageUrl = ep.url ?? (
            typeof ep.id === "string" && ep.id.includes("$")
                ? `${this.api}/media/${ep.id.split("$")[0]}/${ep.number ?? ep.id.split("$")[1]}`
                : undefined
        );

        if (!pageUrl) throw new Error("No se pudo determinar la URL del episodio.");

        const html = await fetch(pageUrl, {
            headers: { Cookie: "__ddg1_=;__ddg2_=;" },
        }).then(r => r.text());

        const parsedData = this.parseSvelteData(html);
        const entry = parsedData.find((x: any) => x?.data?.embeds) || parsedData[3];
        const embeds = entry?.data?.embeds;
        if (!embeds) throw new Error("No se encontraron 'embeds' en los datos del episodio.");

        const selectedEmbeds =
            _server === "HLS"
                ? embeds.SUB ?? []
                : _server === "HLS-DUB"
                    ? embeds.DUB ?? []
                    : (() => { throw new Error(`Servidor desconocido: ${_server}`); })();

        if (!selectedEmbeds.length)
            throw new Error(`No hay mirrors disponibles para ${_server === "HLS" ? "SUB" : "DUB"}.`);

        const match = selectedEmbeds.find((m: any) =>
            (m.url || "").includes("zilla-networks.com/play/")
        );

        if (!match)
            throw new Error(`No se encontró ningún embed de ZillaNetworks en ${_server}.`);

        return {
            server: _server,
            headers: {Referer: 'null'},
            videoSources: [
                {
                    url: match.url.replace("/play/", "/m3u8/"),
                    type: "m3u8" as VideoSourceType,
                    quality: "auto",
                    subtitles: [],
                },
            ],
        };
    }

    private parseSvelteData(html: string): any[] {
        const scriptMatch = html.match(/<script[^>]*>\s*({[^<]*__sveltekit_[\s\S]*?)<\/script>/i);
        if (!scriptMatch) throw new Error("No se encontró bloque SvelteKit en el HTML.");

        const dataMatch = scriptMatch[1].match(/data:\s*(\[[\s\S]*?\])\s*,\s*form:/);
        if (!dataMatch) throw new Error("No se encontró el bloque 'data' en el script SvelteKit.");

        const jsArray = dataMatch[1];
        try {
            return new Function(`"use strict"; return (${jsArray});`)();
        } catch {
            const cleaned = jsArray.replace(/\bvoid 0\b/g, "null").replace(/undefined/g, "null");
            return new Function(`"use strict"; return (${cleaned});`)();
        }
    }
}
