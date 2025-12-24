class Provider implements CustomSource {
    api_key = "{{api-key}}"

    getSettings(): Settings {
        return {
            supportsAnime: true,
            supportsManga: false,
        }
    }

    async getAnime(ids: number[]): Promise<$app.AL_BaseAnime[]> {
        const ret: $app.AL_BaseAnime[] = []
        const mediaCache = $store.get("simkl.media") as Record<number, $app.AL_BaseAnime> | undefined || {}

        const headers = {
            "Content-Type": "application/json",
            "simkl-api-key": this.api_key,
        }

        const idsToFetch: number[] = []
        const cachedResults: $app.AL_BaseAnime[] = []

        for (const id of ids) {
            // devnote: using cache from listAnime breaks things
            // const cached = mediaCache?.[id]
            // if (cached) {
            //     cachedResults.push(cached)
            // } else {
            idsToFetch.push(id)
            // }
        }

        if (idsToFetch.length > 0) {
            const fetchPromises = idsToFetch.map(async (id) => {
                if (!id) return null
                const types: ("anime" | "tv" | "movie")[] = ["tv", "anime", "movie"]

                let metadata: $app.Metadata_AnimeMetadata | null = null
                // fetch metadata if only one query
                if (idsToFetch.length === 1) {
                    metadata = (await this.getAnimeMetadata(id)) || null
                }

                for (const typeSimkl of types) {
                    const endpoint = `https://api.simkl.com/${typeSimkl}/${id}?extended=full&client_id=${this.api_key}`

                    try {
                        const res = await fetch(endpoint, { headers })
                        if (!res.ok) continue // try next

                        const item = res.json<SimklItem>()
                        if (!item || !item.ids) continue // try next

                        const posterPath = item.poster ? `https://simkl.in/posters/${item.poster}_` : ""
                        const title = item.title ?? ""

                        let nextAiringEpisodeMetadata: $app.Metadata_EpisodeMetadata | null = null
                        for (const ep of Object.values(metadata?.episodes ?? {})) {
                            if (!ep.airDate) continue
                            const airDate = new Date(ep.airDate)
                            const now = new Date()
                            if (airDate > now) {
                                nextAiringEpisodeMetadata = ep
                                break
                            }
                        }


                        const base: $app.AL_BaseAnime = {
                            id: item.ids.simkl,
                            siteUrl: item.ids?.slug
                                ? `https://simkl.com/${typeSimkl}/${id}/${item.ids.slug}`
                                : `https://simkl.com/${typeSimkl}/${id}`,
                            title: {
                                userPreferred: title,
                                romaji: title,
                                english: item.en_title ?? title,
                                native: title,
                            },
                            coverImage: {
                                large: !!posterPath ? posterPath + "m.webp" : "",
                                medium: !!posterPath ? posterPath + "m.webp" : "",
                                extraLarge: !!posterPath ? posterPath + "m.webp" : "",
                                color: "",
                            },
                            bannerImage: !!posterPath ? posterPath + "w.jpg" : "",
                            description: item.overview ?? "",
                            genres: item.genres ?? [],
                            meanScore: item.ratings?.simkl?.rating ? Math.round(item.ratings.simkl.rating * 10) : 0,
                            synonyms: (item as any)?.all_titles || [],
                            status: this._toStatus(item.status),
                            episodes: item.total_episodes || 1,
                            type: "ANIME",
                            format: item.type === "movie" ? "MOVIE" : "TV",
                            seasonYear: item.year,
                            isAdult: (item as any).adult ?? false,
                            startDate: this._parseDate(item.first_aired, item.year),
                            endDate: undefined,
                            nextAiringEpisode: !nextAiringEpisodeMetadata ? undefined : {
                                episode: nextAiringEpisodeMetadata.episodeNumber,
                                airingAt: new Date(nextAiringEpisodeMetadata.airDate).getTime(),
                                timeUntilAiring: Math.floor((new Date(nextAiringEpisodeMetadata.airDate).getTime() - Date.now()) / 1000),
                            },
                        }

                        return base
                    }
                    catch (err) {

                    }
                }

                // nothing found
                return null
            })

            const fetchedResults = await Promise.all(fetchPromises)

            // update cache
            const updatedCache = { ...mediaCache }

            for (const result of fetchedResults) {
                if (result) {
                    updatedCache[result.id] = result
                    ret.push(result)
                }
            }

            $store.set("simkl.media", updatedCache)
        }

        ret.push(...cachedResults)

        return ret
    }

    async getAnimeDetails(id: number): Promise<$app.AL_AnimeDetailsById_Media | null> {
        return null
    }

    private _parseDate(dateStr: string | undefined, year: number) {
        if (!dateStr) return { year: year, month: undefined, day: undefined }
        const d = new Date(dateStr)
        return {
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1,
            day: d.getUTCDate(),
        }
    }

    private _toStatus(status: string) {
        if (!status) return "FINISHED"
        const s = status.toUpperCase()
        if (s === "AIRING") return "RELEASING"
        if (s === "TBA") return "NOT_YET_RELEASED"
        return "FINISHED"
    }

    async getAnimeMetadata(id: number): Promise<$app.Metadata_AnimeMetadata | null> {
        const mediaCache = $store.get("simkl.media") as Record<number, $app.AL_BaseAnime> | undefined
        const metadataCache = $store.get("simkl.metadata") as Record<number, $app.Metadata_AnimeMetadata> | undefined

        const cachedMetadata = metadataCache?.[id]
        if (cachedMetadata) return cachedMetadata

        const cachedTitle = mediaCache?.[id]?.title

        const types: ("anime" | "tv" | "movie")[] = ["tv", "anime", "movie"]

        for (const typeSimkl of types) {
            // if (typeSimkl === "movie") {
            //     const metadata: $app.Metadata_AnimeMetadata = {
            //         titles: { en: cachedTitle?.english ?? cachedTitle?.native ?? "Movie" },
            //         episodes: {
            //             "1": {
            //                 anidbId: 0,
            //                 tvdbId: 0,
            //                 anidbEid: 0,
            //                 title: cachedTitle?.english ?? cachedTitle?.native ?? "Movie",
            //                 image: "",
            //                 airDate: "",
            //                 length: 90,
            //                 summary: "",
            //                 overview: "",
            //                 episodeNumber: 1,
            //                 episode: "1",
            //                 seasonNumber: 1,
            //                 absoluteEpisodeNumber: 1,
            //                 hasImage: false,
            //             },
            //         },
            //         episodeCount: 1,
            //         specialCount: 0,
            //     }
            //
            //     $store.set("simkl.metadata", { ...metadataCache, [id]: metadata })
            //     return metadata
            // }


            const endpoint = `https://api.simkl.com/${typeSimkl}/episodes/${id}?extended=full&client_id=${this.api_key}`

            try {
                const res = await fetch(endpoint, { headers: { "Content-Type": "application/json" } })
                if (!res.ok) continue // try next

                const data = await res.json()
                if (!Array.isArray(data)) continue // try next

                // First pass: calculate episode counts per season to determine offsets
                const seasonEpisodeCounts: Record<number, number> = {}
                for (const ep of data) {
                    const season = ep.season || 1
                    const isSpecial = ep.type === "special"
                    if (!isSpecial) {
                        seasonEpisodeCounts[season] = (seasonEpisodeCounts[season] || 0) + 1
                    }
                }

                // Calculate offsets for each season
                const seasonOffsets: Record<number, number> = {}
                const sortedSeasons = Object.keys(seasonEpisodeCounts).map(Number).sort((a, b) => a - b)
                let cumulativeOffset = 0
                for (const season of sortedSeasons) {
                    seasonOffsets[season] = cumulativeOffset
                    cumulativeOffset += seasonEpisodeCounts[season]
                }

                const episodes: Record<string, $app.Metadata_EpisodeMetadata> = {}
                let specialCount = 0

                for (const ep of data) {
                    const episodeNumber = Number(ep.episode) || 1
                    const season = ep.season || 1
                    const isSpecial = ep.type === "special"
                    if (isSpecial) continue

                    // Calculate absolute episode number by adding season offset
                    const seasonOffset = isSpecial ? 0 : (seasonOffsets[season] || 0)
                    const absoluteEpisodeNumber = seasonOffset + episodeNumber

                    const image = ep.img ? `https://simkl.in/episodes/${ep.img}_w.jpg` : ""

                    episodes[absoluteEpisodeNumber.toString()] = {
                        anidbId: 0,
                        tvdbId: 0,
                        anidbEid: 0,
                        title: ep.title ?? `Episode ${episodeNumber}`,
                        image: image,
                        airDate: new Date(ep.date).toISOString().split("T")[0],
                        length: 0,
                        summary: ep.description ?? "",
                        overview: ep.description ?? "",
                        episodeNumber: absoluteEpisodeNumber,
                        episode: absoluteEpisodeNumber.toString(),
                        seasonNumber: season,
                        absoluteEpisodeNumber: absoluteEpisodeNumber,
                        hasImage: !!ep.img,
                    }
                }

                const orderedEpisodes = Object.fromEntries(
                    Object.entries(episodes).sort(([, a], [, b]) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)),
                )

                const metadata = {
                    titles: { en: cachedTitle?.english ?? cachedTitle?.native ?? "" },
                    episodes: orderedEpisodes,
                    episodeCount: Object.values(orderedEpisodes)
                        .filter(e => e && e.title && !e.title.toLowerCase().includes("special")).length,
                    specialCount: specialCount,
                }
                $store.set("simkl.metadata", { ...metadataCache, [id]: metadata })
                return metadata
            }
            catch (err) {
            }
        }

        return null
    }

    async getAnimeWithRelations(id: number): Promise<$app.AL_CompleteAnime> {
        const media = $store.get("simkl.media") as Record<number, $app.AL_CompleteAnime>
        const cached = media?.[id]
        if (!cached) throw new Error("not found.")

        return {
            ...cached,
            relations: { edges: [] },
        }
    }

    async listAnime(search: string, page: number, perPage: number): Promise<ListResponse<$app.AL_BaseAnime>> {
        const headers = {
            "Content-Type": "application/json",
            "simkl-api-key": this.api_key,
        };

        const types: ("anime" | "tv" | "movie")[] = ["anime", "tv", "movie"];

        const fetchPromises: Promise<any[]>[] = [];
        if (search.trim() === "") {
            const url = `https://api.simkl.com/anime/trending/?extended=overview,metadata,tmdb,genres,trailer&client_id=${this.api_key}`;
            fetchPromises.push(
                fetch(url, { headers })
                    .then(r => r.ok ? r.json() : [])
                    .catch(() => [])
            );
        } else {
            for (const t of types) {
                const url = `https://api.simkl.com/search/${t}?q=${encodeURIComponent(search)}&page=${page}&limit=${perPage}&extended=full&client_id=${this.api_key}`;
                fetchPromises.push(
                    fetch(url, { headers })
                        .then(r => r.ok ? r.json() : [])
                        .catch(() => [])
                );
            }
        }

        const results = (await Promise.all(fetchPromises)).flat().filter(x => x && x.ids);

        const media: $app.AL_BaseAnime[] = results.map((item) => {
            const posterPath = item.poster ? `https://simkl.in/posters/${item.poster}_` : "";
            const title = item.title ?? "";

            return {
                id: item.ids.simkl_id,
                siteUrl: `https://simkl.com/`,
                title: {
                    userPreferred: title,
                    romaji: title,
                    english: item.title_en ?? title,
                    native: title,
                },
                coverImage: {
                    large: posterPath ? posterPath + "m.webp" : "",
                    medium: posterPath ? posterPath + "m.webp" : "",
                    extraLarge: posterPath ? posterPath + "m.webp" : "",
                    color: "",
                },
                bannerImage: posterPath ? posterPath + "w.jpg" : "",
                description: undefined,
                genres: [],
                meanScore: item.ratings?.simkl?.rating ? Math.round(item.ratings.simkl.rating * 10) : 0,
                synonyms: item.all_titles || [],
                status: this._toStatus(item.status),
                episodes: item.ep_count || 1,
                type: "ANIME",
                format: item.endpoint_type === "movie" ? "MOVIE" : "TV",
                seasonYear: item.year,
                isAdult: (item as any).adult ?? false,
                startDate: this._parseDate(undefined, item.year),
                endDate: undefined,
            };
        });

        $store.set("simkl.media", Object.fromEntries(media.map((m) => [m.id, m])));

        return {
            media: media,
            total: media.length,
            page: page,
            totalPages: Math.ceil(media.length / perPage) || 1,
        };
    }


    async getManga(ids: number[]): Promise<$app.AL_BaseManga[]> {
        return Promise.resolve([])
    }

    async getMangaDetails(id: number): Promise<$app.AL_MangaDetailsById_Media | null> {
        return null
    }

    async listManga(search: string, page: number, perPage: number): Promise<ListResponse<$app.AL_BaseManga>> {
        return { media: [], total: 0, page: 1, totalPages: 1 }
    }
}

export interface SimklItem {
    title: string;
    en_title: string | null;
    year: number;
    type: "show" | "movie" | string;
    ids: SimklIds;
    rank: number;
    poster: string;
    fanart: string;
    first_aired: string; // ISO date
    airs: SimklAirs;
    runtime: number;
    certification: string;
    overview: string;
    genres: string[];
    country: string;
    total_episodes: number;
    status: "ended" | "tba" | "airing"
    network: string;
    ratings: SimklRatings;
    trailers: null | any;
}

export interface SimklSearchResult {
    title: string;
    title_en?: string;
    title_romaji?: string;
    year: number;
    endpoint_type: "anime" | "movie" | "show" | string;
    type: string;
    poster: string;
    all_titles: string[];
    url: string;
    ep_count?: number;
    rank: number;
    status: string;
    ratings: SimklRatings;
    ids: SimklSearchIds;
}

export interface SimklSearchIds {
    simkl_id: number;
    slug: string;
}

export interface SimklIds {
    simkl: number;
    slug: string;
    tvdb?: string;
    imdb?: string;
    zap2it?: string;
}

export interface SimklAirs {
    day: string;
    time: string;
    timezone: string;
}

export interface SimklRatings {
    simkl?: SimklRatingSource;
    imdb?: SimklRatingSource;
    mal?: SimklRatingSource;
}

export interface SimklRatingSource {
    rating: number;
    votes: number;
}