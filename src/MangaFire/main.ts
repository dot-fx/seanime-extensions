class Provider {
    private api = "https://mangafire.to";

    getSettings(): Settings {
        return {
            supportsMultiLanguage: true,
            supportsMultiScanlator: false,
        };
    }

    async search(opts: { query: string }): Promise<SearchResult[]> {
        const vrf = this.generate(opts.query.trim());
        const res = await fetch(`${this.api}/ajax/manga/search?keyword=${opts.query.replaceAll(" ", "+")}&vrf=${vrf}`);
        const data = await res.json();

        if (!data?.result?.html) return [];

        const $ = LoadDoc(data.result.html);

        return $("a.unit").map((i, e) => {
            const id = e.attr("href")?.replace("/manga/", "")
            const title = e.find("h6").text().trim()
            const image = e.find("img").attr("src")

            return {
                id,
                title,
                synonyms: [],
                year: 1,
                image
            };
        });
    }

    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        const reslangs = await fetch(`${this.api}/manga/${mangaId}`);
        const htmlLang = await reslangs.text();

        const dataCodes = this.extractLanguageCodes(htmlLang);
        const allChapters: ChapterDetails[] = [];

        for (const lang of dataCodes) {
            const chapters = await this.fetchChaptersForLanguage(mangaId, lang);
            allChapters.push(...chapters);
        }

        return allChapters;
    }

    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        // Para chapter pages, el input es "chapter@" + chapterId
        const vrf = this.generate("chapter@" + chapterId);
        const res = await fetch(`${this.api}/ajax/read/chapter/${chapterId}?vrf=${vrf}`);
        const data = await res.json();
        const images = data.result?.images;

        if (!images?.length) return [];

        return images.map((img: any[], i: number) => ({
            url: img[0],
            index: i,
            headers: {
                Referer: `${this.api}`,
            },
        }));
    }

    // ------------------------
    // AUXILIAR FUNCTIONS
    // ------------------------

    private extractLanguageCodes(html: string): string[] {
        const $ = LoadDoc(html);
        const langMap = new Map<string, string>();

        $("[data-code][data-title]").each((i, e) => {
            let code = e.attr("data-code")?.toLowerCase() || "";
            const title = e.attr("data-title") || "";

            if (code === 'es' && title.includes('LATAM')) code = 'es-la';
            else if (code === 'pt' && title.includes('Br')) code = 'pt-br';

            langMap.set(code, code);
        });

        return Array.from(langMap.values());
    }

    private async fetchChaptersForLanguage(mangaId: string, lang: string): Promise<ChapterDetails[]> {
        const mangaIdShort = mangaId.split(".").pop() || "";

        const vrf = this.generate(mangaIdShort + "@chapter@" + lang);

        const res = await fetch(
            `${this.api}/ajax/read/${mangaIdShort}/chapter/${lang}?vrf=${vrf}`
        );

        const data = await res.json();
        const html = data.result?.html || "";

        if (!html) return [];

        const $ = LoadDoc(html);
        const langChapters: ChapterDetails[] = [];

        $("a[data-number][data-id]").each((i, e) => {
            const url = e.attr("href") || "";
            const chapter = e.attr("data-number") || "";
            const id = e.attr("data-id") || "";
            const title = e.attr("title") || "";
            const language = this.normalizeLanguageCode(lang)

            langChapters.push({
                id: id,
                url: `${this.api}${url}`,
                title: title,
                chapter: chapter,
                index: 0,
                language: language,
            });
        });

        langChapters.reverse();
        langChapters.forEach((ch, i) => (ch.index = i));

        return langChapters;
    }

    private normalizeLanguageCode(lang: string): string {
        const langToISO: Record<string, string> = {
            'en': 'en',
            'fr': 'fr',
            'es': 'es',
            'es-la': 'es-419',
            'pt': 'pt',
            'pt-br': 'pt-br',
            'ja': 'ja',
            'de': 'de',
            'it': 'it',
            'ru': 'ru',
            'ko': 'ko',
            'zh': 'zh',
            'zh-cn': 'zh-cn',
            'zh-tw': 'zh-tw',
            'ar': 'ar',
            'tr': 'tr',
        };

        return langToISO[lang] || lang;
    }

    private textEncode(str: string): Uint8Array {
        return Uint8Array.from(Buffer.from(str, "utf-8"));
    }

    private textDecode(bytes: Uint8Array): string {
        return Buffer.from(bytes).toString("utf-8");
    }

    private atob(data: string): Uint8Array {
        return Uint8Array.from(Buffer.from(data, 'base64'));
    }

    private btoa(data: Uint8Array): string {
        return Buffer.from(data).toString('base64');
    }

    private add8(n: number): (c: number) => number {
        return (c: number) => (c + n) & 0xff;
    }

    private sub8(n: number): (c: number) => number {
        return (c: number) => (c - n + 256) & 0xff;
    }

    private xor8(n: number): (c: number) => number {
        return (c: number) => (c ^ n) & 0xff;
    }

    private rotl8(n: number): (c: number) => number {
        return (c: number) => ((c << n) | (c >> (8 - n))) & 0xff;
    }

    private rotr8(n: number): (c: number) => number {
        return (c: number) => ((c >> n) | (c << (8 - n))) & 0xff;
    }

    private scheduleC = [
        this.sub8(223), this.rotr8(4), this.rotr8(4), this.add8(234), this.rotr8(7),
        this.rotr8(2), this.rotr8(7), this.sub8(223), this.rotr8(7), this.rotr8(6),
    ];

    private scheduleY = [
        this.add8(19), this.rotr8(7), this.add8(19), this.rotr8(6), this.add8(19),
        this.rotr8(1), this.add8(19), this.rotr8(6), this.rotr8(7), this.rotr8(4),
    ];

    private scheduleB = [
        this.sub8(223), this.rotr8(1), this.add8(19), this.sub8(223), this.rotl8(2),
        this.sub8(223), this.add8(19), this.rotl8(1), this.rotl8(2), this.rotl8(1),
    ];

    private scheduleJ = [
        this.add8(19), this.rotl8(1), this.rotl8(1), this.rotr8(1), this.add8(234),
        this.rotl8(1), this.sub8(223), this.rotl8(6), this.rotl8(4), this.rotl8(1),
    ];

    private scheduleE = [
        this.rotr8(1), this.rotl8(1), this.rotl8(6), this.rotr8(1), this.rotl8(2),
        this.rotr8(4), this.rotl8(1), this.rotl8(1), this.sub8(223), this.rotl8(2),
    ];

    private rc4Keys: Record<string, string> = {
        l: "FgxyJUQDPUGSzwbAq/ToWn4/e8jYzvabE+dLMb1XU1o=",
        g: "CQx3CLwswJAnM1VxOqX+y+f3eUns03ulxv8Z+0gUyik=",
        B: "fAS+otFLkKsKAJzu3yU+rGOlbbFVq+u+LaS6+s1eCJs=",
        m: "Oy45fQVK9kq9019+VysXVlz1F9S1YwYKgXyzGlZrijo=",
        F: "aoDIdXezm2l3HrcnQdkPJTDT8+W6mcl2/02ewBHfPzg=",
    };

    private seeds32: Record<string, string> = {
        A: "yH6MXnMEcDVWO/9a6P9W92BAh1eRLVFxFlWTHUqQ474=",
        V: "RK7y4dZ0azs9Uqz+bbFB46Bx2K9EHg74ndxknY9uknA=",
        N: "rqr9HeTQOg8TlFiIGZpJaxcvAaKHwMwrkqojJCpcvoc=",
        P: "/4GPpmZXYpn5RpkP7FC/dt8SXz7W30nUZTe8wb+3xmU=",
        k: "wsSGSBXKWA9q1oDJpjtJddVxH+evCfL5SO9HZnUDFU8=",
    };

    private prefixKeys: Record<string, string> = {
        O: "l9PavRg=",
        v: "Ml2v7ag1Jg==",
        L: "i/Va0UxrbMo=",
        p: "WFjKAHGEkQM=",
        W: "5Rr27rWd",
    };

    private rc4(key: Uint8Array, input: Uint8Array): Uint8Array {
        const s = new Uint8Array(256);
        for (let i = 0; i < 256; i++) s[i] = i;

        let j = 0;
        for (let i = 0; i < 256; i++) {
            j = (j + s[i] + key[i % key.length]) & 0xff;
            [s[i], s[j]] = [s[j], s[i]];
        }

        const output = new Uint8Array(input.length);
        let i = 0;
        j = 0;
        for (let y = 0; y < input.length; y++) {
            i = (i + 1) & 0xff;
            j = (j + s[i]) & 0xff;
            [s[i], s[j]] = [s[j], s[i]];
            const k = s[(s[i] + s[j]) & 0xff];
            output[y] = input[y] ^ k;
        }

        return output;
    }

    private transform(
        input: Uint8Array,
        initSeedBytes: Uint8Array,
        prefixKeyBytes: Uint8Array,
        prefixLen: number,
        schedule: ((c: number) => number)[]
    ): Uint8Array {
        const out: number[] = [];
        for (let i = 0; i < input.length; i++) {
            if (i < prefixLen) {
                out.push(prefixKeyBytes[i] || 0);
            }
            const transformed = schedule[i % 10]((input[i] ^ initSeedBytes[i % 32]) & 0xff) & 0xff;
            out.push(transformed);
        }
        return new Uint8Array(out);
    }

    generate(input: string): string {
        let encodedInput = encodeURIComponent(input);
        let bytes = this.textEncode(encodedInput);

        // Etapa 1: RC4 con clave "l" + Transform con schedule_c
        bytes = this.rc4(this.atob(this.rc4Keys["l"]), bytes);
        const prefix_O = this.atob(this.prefixKeys["O"]);
        bytes = this.transform(bytes, this.atob(this.seeds32["A"]), prefix_O, prefix_O.length, this.scheduleC);

        // Etapa 2: RC4 con clave "g" + Transform con schedule_y
        bytes = this.rc4(this.atob(this.rc4Keys["g"]), bytes);
        const prefix_v = this.atob(this.prefixKeys["v"]);
        bytes = this.transform(bytes, this.atob(this.seeds32["V"]), prefix_v, prefix_v.length, this.scheduleY);

        // Etapa 3: RC4 con clave "B" + Transform con schedule_b
        bytes = this.rc4(this.atob(this.rc4Keys["B"]), bytes);
        const prefix_L = this.atob(this.prefixKeys["L"]);
        bytes = this.transform(bytes, this.atob(this.seeds32["N"]), prefix_L, prefix_L.length, this.scheduleB);

        // Etapa 4: RC4 con clave "m" + Transform con schedule_j
        bytes = this.rc4(this.atob(this.rc4Keys["m"]), bytes);
        const prefix_p = this.atob(this.prefixKeys["p"]);
        bytes = this.transform(bytes, this.atob(this.seeds32["P"]), prefix_p, prefix_p.length, this.scheduleJ);

        // Etapa 5: RC4 con clave "F" + Transform con schedule_e
        bytes = this.rc4(this.atob(this.rc4Keys["F"]), bytes);
        const prefix_W = this.atob(this.prefixKeys["W"]);
        bytes = this.transform(bytes, this.atob(this.seeds32["k"]), prefix_W, prefix_W.length, this.scheduleE);

        // Base64URL encode
        return this.btoa(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
}