/// <reference path="../online-streaming-provider.d.ts" />

class Provider {
    baseUrl = "https://animeav1.com";
    cdnUrl = "https://cdn.animeav1.com";

    getSettings(): Settings {
        return {
            episodeServers: ["HLS"],
            supportsDub: true,
        };
    }

    private _resolveRemixData(json: any, isDub: boolean): SearchResult[] {
        if (!json || !json.nodes) return [];

        for (const node of json.nodes) {
            if (node && node.uses && node.uses.search_params) {
                const data = node.data;
                if (!data || data.length === 0) continue;

                const rootConfig = data[0];
                if (!rootConfig || typeof rootConfig.results !== 'number') continue;

                const resultsIndex = rootConfig.results;
                const animePointers = data[resultsIndex];

                if (!Array.isArray(animePointers)) continue;

                return animePointers.map((pointer: number) => {
                    const rawObj = data[pointer];
                    if (!rawObj) return null;

                    const realId = data[rawObj.id];
                    const title = data[rawObj.title];
                    const slug = data[rawObj.slug];

                    if (!title || !slug) return null;

                    // --- LÓGICA HIANIME APLICADA ---
                    // Guardamos el tipo (sub/dub) dentro del ID usando un objeto JSON stringified
                    // Esto viaja a findEpisodes
                    const idPayload = JSON.stringify({ slug: slug, type: isDub ? "dub" : "sub" });

                    return {
                        id: idPayload,
                        title: title,
                        url: `${this.baseUrl}/media/${slug}`,
                        image: `${this.cdnUrl}/covers/${realId}.jpg`,
                        subOrDub: isDub ? "dub" : "sub"
                    };
                }).filter(Boolean) as SearchResult[];
            }
        }
        return [];
    }

    async search(query: SearchOptions): Promise<SearchResult[]> {
        const params = new URLSearchParams();
        params.append('page', '1');

        if (query.query && query.query.trim() !== "") {
            params.append('search', query.query);
        }

        const url = `${this.baseUrl}/catalogo/__data.json?${params.toString()}`;

        try {
            const response = await fetch(url);
            if (!response.ok) return [];
            const json = await response.json();

            // Pasamos query.dub para decidir qué ID generar
            return this._resolveRemixData(json, query.dub || false);
        } catch (error) {
            console.error("Error searching AnimeAV1:", error);
            return [];
        }
    }

    async findEpisodes(animeId: string): Promise<EpisodeDetails[]> {
        // 1. DESEMPAQUETAMOS EL ID QUE VIENE DE SEARCH
        // Ejemplo animeId: '{"slug":"one-piece","type":"sub"}'
        let slug: string;
        let type: "sub" | "dub" = "sub";

        try {
            const parsed = JSON.parse(animeId);
            slug = parsed.slug;
            if (parsed.type) type = parsed.type;
        } catch {
            // Fallback por si acaso llega un ID plano
            slug = animeId;
        }

        const url = `${this.baseUrl}/media/${slug}/__data.json`;

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Error fetching episodes");

            const json = await res.json();
            const nodes = json.nodes || [];

            let data: any[] | null = null;
            let mediaDescriptor: any = null;

            // Buscamos el nodo correcto
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (!node?.data) continue;

                for (const obj of node.data) {
                    if (obj && typeof obj === 'object' && 'slug' in obj && 'episodes' in obj) {
                        const slugPointer = obj.slug;
                        if (typeof slugPointer === 'number' && node.data[slugPointer] === slug) {
                            data = node.data;
                            mediaDescriptor = obj;
                            break;
                        }
                    }
                }
                if (data) break;
            }

            if (!data || !mediaDescriptor) throw new Error("Anime no encontrado");

            const episodeIndexes = data[mediaDescriptor.episodes];
            if (!Array.isArray(episodeIndexes)) throw new Error("Lista inválida");

            const mediaId = data[mediaDescriptor.id];
            const image = mediaId ? `${this.cdnUrl}/backdrops/${mediaId}.jpg` : undefined;

            return episodeIndexes.map((epIdx: number, i: number) => {
                const ep = data![epIdx];

                let realNumber = i + 1;
                if (typeof ep.number === 'number') {
                    const resolvedNum = data![ep.number];
                    if (typeof resolvedNum === 'number') realNumber = resolvedNum;
                }

                let realTitle = `Episodio ${realNumber}`;
                if (typeof ep.title === 'number') realTitle = data![ep.title];
                else if (ep.title) realTitle = ep.title;

                // --- LÓGICA HIANIME APLICADA ---
                // Aquí construimos el ID del EPISODIO incluyendo el tipo (sub/dub)
                // que recibimos del ID del anime.
                const episodeIdPayload = JSON.stringify({
                    slug: slug,
                    number: realNumber,
                    type: type // <--- Pasamos "sub" o "dub" aquí
                });

                return {
                    id: episodeIdPayload,
                    number: realNumber,
                    title: realTitle,
                    url: `${this.baseUrl}/media/${slug}/${realNumber}`,
                    image: image
                };
            });

        } catch (err) {
            console.error('Error finding episodes:', err);
            return [];
        }
    }

    // Ya no necesitamos el 3er argumento 'category', lo sacamos del ID
    async findEpisodeServer(episodeOrId: any, _server: string): Promise<EpisodeServer> {
        let slug: string;
        let number: number;
        let type: string = "sub"; // Por defecto sub

        const idStr = typeof episodeOrId === "string" ? episodeOrId : episodeOrId.id;

        // 2. DESEMPAQUETAMOS EL ID DEL EPISODIO
        // Ejemplo idStr: '{"slug":"one-piece","number":1,"type":"dub"}'
        try {
            const parsed = JSON.parse(idStr);
            slug = parsed.slug;
            number = parsed.number;
            if (parsed.type) type = parsed.type;
        } catch (e) {
            throw new Error("ID inválido");
        }

        const pageUrl = `${this.baseUrl}/media/${slug}/${number}/__data.json`;
        const res = await fetch(pageUrl);
        if(!res.ok) throw new Error("Error obteniendo datos");
        const json = await res.json();

        let data: any[] | null = null;
        let root: any = null;

        if (json.nodes) {
            for (const node of json.nodes) {
                if (node?.data) {
                    const foundRoot = node.data.find((item: any) => item && typeof item === 'object' && 'embeds' in item);
                    if (foundRoot) {
                        data = node.data;
                        root = foundRoot;
                        break;
                    }
                }
            }
        }

        if (!data || !root) throw new Error("No se encontraron servidores");

        const embedsIndex = root.embeds;
        const embedsObj = data[embedsIndex];

        // --- LÓGICA HIANIME APLICADA ---
        // Usamos la variable 'type' que extrajimos del ID para elegir la lista correcta
        const catKey = type.toUpperCase(); // "SUB" o "DUB"
        const listIndex = embedsObj?.[catKey];

        if (typeof listIndex !== "number") throw new Error(`No hay contenido en ${catKey}`);

        const serverList = data[listIndex];
        if (!Array.isArray(serverList)) throw new Error("Lista vacía");

        let chosen: VideoSource | null = null;

        for (const ptr of serverList) {
            const srv = data[ptr];
            if (!srv) continue;
            const serverName = data[srv.server];
            const link = data[srv.url];

            if (!serverName || !link) continue;

            if (serverName === "HLS") {
                chosen = {
                    url: link.replace("/play/", "/m3u8/"),
                    type: "m3u8",
                    quality: "auto",
                    subtitles: [],
                };
                break;
            }
        }

        if (!chosen) throw new Error(`No se encontró stream HLS para ${type}`);

        return {
            server: "HLS",
            headers: { Referer: "null" },
            videoSources: [chosen]
        };
    }
}