/// <reference path="./anime-torrent-provider.d.ts" />

class Provider {
    private api = "https://apibay.org"

    // Returns the provider settings.
    async getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: false,
            smartSearchFilters: [],
            supportsAdult: false,
            type: "main",
        }
    }

    private buildMagnet(infoHash: string, name: string): string {
        const trackers = [
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://open.stealth.si:80/announce",
            "udp://tracker.torrent.eu.org:451/announce",
            "udp://tracker.dler.org:6969/announce",
            "udp://public.popcorn-tracker.org:6969/announce",
            "udp://open.demonii.com:1337/announce",
            "udp://glotorrents.pw:6969/announce",

            "udp://exodus.desync.com:6969",
            "udp://tracker.internetwarriors.net:1337",
            "udp://p4p.arenabg.com:1337",
            "udp://tracker.coppersurfer.tk:6969",
            "udp://torrent.gresille.org:80/announce",
            "udp://tracker.leechers-paradise.org:6969",
            "udp://tracker.bittor.pw:1337"
        ];

        const tr = trackers
            .map(t => `&tr=${encodeURIComponent(t)}`)
            .join("");

        return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${tr}`;
    }

    private extractResolution(name: string): string {
        const match = name.match(/(\b\d{3,4}p\b|\b[48]K\b)/i);
        return match ? match[1] : "";
    }

    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        const res = await fetch(`${this.api}/q.php?q=${encodeURIComponent(opts.query)}`);
        const json = await res.json();

        const filtered = json.filter((t: any) => Number(t.seeders) > 0);

        return filtered.map((t: any): AnimeTorrent => {
            const infoHash = t.info_hash || null;

            return {
                name: t.name,
                date: new Date(Number(t.added) * 1000).toISOString(),
                size: Number(t.size),
                formattedSize: "",
                seeders: Number(t.seeders),
                leechers: Number(t.leechers),
                downloadCount: 0,
                link: `${this.api}/torrent/${t.id}`,
                downloadUrl: "",
                magnetLink: infoHash ? this.buildMagnet(infoHash, t.name) : null,
                infoHash: infoHash,
                resolution: this.extractResolution(t.name),
                isBatch: false,
                episodeNumber: -1,
                releaseGroup: "",
                isBestRelease: false,
                confirmed: true
            };
        });
    }

    // Scrapes the torrent page to get the info hash.
    // If already present in AnimeTorrent, this should just return the info hash without scraping.
    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        return torrent.infoHash
    }
    // Scrapes the torrent page to get the magnet link.
    // If already present in AnimeTorrent, this should just return the magnet link without scraping.
    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        return torrent.magnetLink
    }
    // Returns the latest torrents.
    // Note that this is only used by "main" providers.
    async getLatest(): Promise<AnimeTorrent[]> {
        // TODO
        return []
    }
}