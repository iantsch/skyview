import { LitElement, PropertyValueMap, TemplateResult, html, nothing, render, svg } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { globalStyles } from "./styles";
import { map } from "lit-html/directives/map.js";
// @ts-ignore
import { Agent } from "@intrnl/bluesky-client/agent";
// @ts-ignore
import type { DID } from "@intrnl/bluesky-client/atp-schema";

function getTimeDifferenceString(inputDate: string): string {
    const currentDate = new Date();
    const inputDateTime = new Date(inputDate);

    const timeDifference = currentDate.getTime() - inputDateTime.getTime();
    const seconds = Math.floor(timeDifference / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const years = Math.floor(days / 365);

    if (years > 0) {
        return `${years}y}`;
    } else if (days > 0) {
        return `${days}d`;
    } else if (hours > 0) {
        return `${hours}h`;
    } else if (minutes > 0) {
        return `${minutes}m`;
    } else {
        return `${seconds}s`;
    }
}

function replaceHandles(text: string): string {
    const handleRegex = /@([\p{L}_.-]+)/gu;
    const replacedText = text.replace(handleRegex, (match, handle) => {
        return `<a class="text-primary" href="https://bsky.app/profile/${handle}">@${handle}</a>`;
    });

    return replacedText;
}

function applyFacets(record: BskyRecord): string {
    if (!record.facets) {
        return record.text;
    }

    let modifiedText = record.text;

    const sortedFacets = record.facets.sort((a, b) => a.index.byteStart - b.index.byteStart);

    for (const facet of sortedFacets) {
        if (facet.features[0].tag) {
            facet.index.byteStart--;
        }
        const facetText = modifiedText.slice(facet.index.byteStart, facet.index.byteEnd);
        const replacements = facet.features.map((feature) => {
            const { uri, tag } = feature;
            return `<a class="text-primary" href="${uri || ""}" tag="${tag || ""}">${facetText}</a>`;
        });

        const facetStart = facet.index.byteStart;
        const facetEnd = facet.index.byteEnd;

        // Replace the facet in the modifiedText
        modifiedText = modifiedText.slice(0, facetStart) + replacements.join("") + modifiedText.slice(facetEnd);

        // Adjust byteStart and byteEnd for subsequent facets
        const diff = replacements.join("").length - (facetEnd - facetStart) - 1;
        for (const nextFacet of sortedFacets) {
            if (nextFacet.index.byteStart > facetEnd) {
                nextFacet.index.byteStart += diff;
                nextFacet.index.byteEnd += diff;
            }
        }
    }

    return modifiedText;
}
function processText(record: BskyRecord) {
    return replaceHandles(applyFacets(record)).replaceAll("\n", "<br/>");
}

@customElement("radio-button-group")
class RadioButtonGroup extends LitElement {
    @property()
    selectedValue = "funny";
    @property()
    options = ["funny", "serious"];
    @property()
    disabled = false;

    static styles = [globalStyles];

    render() {
        return html`<div class="flex gap-2">
            ${this.options.map(
                (option) => html`
                    <label>
                        <input
                            type="radio"
                            name="radioGroup"
                            .value=${option}
                            .checked=${this.selectedValue === option}
                            @change=${this.handleRadioChange}
                            ${this.disabled ? "disabled" : ""}
                        />
                        ${this.capitalizeFirstLetter(option)}
                    </label>
                `
            )}
        </div>`;
    }

    capitalizeFirstLetter(str: string) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    handleRadioChange(e: Event) {
        const selectedValue = (e.target as HTMLInputElement).value;
        this.selectedValue = selectedValue;
        this.dispatchEvent(
            new CustomEvent("change", {
                detail: {
                    value: selectedValue,
                },
            })
        );
    }
}

@customElement("skyview-popup")
class Popup extends LitElement {
    static styles = globalStyles;

    @property()
    buttonText = "Click me";

    @property()
    show = false;

    protected render(): TemplateResult {
        return html`<div class="relative">
            <div @click=${() => (this.show = !this.show)} class="rounded bg-black p-1 text-xs">${this.buttonText}</div>
            ${this.show
                ? html`<div @click=${() => (this.show = !this.show)} class="absolute bg-black p-4 rounded border border-gray/50">
                      <slot></slot>
                  </div>`
                : nothing}
        </div> `;
    }
}

function dom(template: TemplateResult, container?: HTMLElement | DocumentFragment): HTMLElement[] {
    if (container) {
        render(template, container);
        return [];
    }

    const div = document.createElement(`div`);
    render(template, div);
    const children: Element[] = [];
    for (let i = 0; i < div.children.length; i++) {
        children.push(div.children[i]);
    }
    return children as HTMLElement[];
}

function renderGallery(images: BskyImage[], expandGallery = false): HTMLElement {
    const galleryDom = dom(html`
        <div class="flex flex-col gap-2 mt-2">
            ${images.map(
                (img, index) => html`
                    <div class="relative flex flex-col items-center ${index && !expandGallery ? "hidden" : ""}">
                        <img class="max-h-[70vh]" src="${img.thumb}" alt="${img.alt}" ) />
                        ${img.alt && img.alt.length > 0
                            ? html`<skyview-popup buttonText="ALT" text="${img.alt}" class="absolute left-1 bottom-1 cursor-pointer">
                                  <div class="w-[350px]">${img.alt}</div>
                              </skyview-popup>`
                            : nothing}
                    </div>
                `
            )}
            ${images.length > 1 && !expandGallery
                ? html`<div
                      id="toggle"
                      class="text-primary text-center"
                      @click=${(ev: Event) => {
                          imageDoms[0].click();
                          (ev.target as HTMLElement).innerText = `Show ${images.length - 1} more images`;
                      }}
                  >
                      Show ${images.length - 1} more images
                  </div>`
                : nothing}
        </div>
    `)[0];

    const imageDoms = galleryDom.querySelectorAll("img");
    const imageClickListener = () => {
        imageDoms.forEach((img, index) => {
            if (index == 0) return;
            img.parentElement!.classList.toggle("hidden");
        });
        if (imageDoms[1].classList.contains("hidden")) {
            imageDoms[0].scrollIntoView({
                behavior: "auto",
                block: "nearest",
            });
        } else {
            (galleryDom.querySelector("#toggle") as HTMLElement).remove();
        }
    };

    if (!expandGallery) {
        for (let i = 0; i < imageDoms.length; i++) {
            imageDoms[i].addEventListener("click", imageClickListener);
        }
    }
    return galleryDom;
}

function renderCard(card: BskyExternalCard) {
    return html` <a href="${card.uri}" class="inline-block w-full border border-gray/50 rounded mt-2">
        <div class="flex">
            ${card.thumb
                ? html`<div class="flex-none"><img src="${card.thumb}" class="!w-[6.5em] !max-h-full !h-full !object-cover !rounded-r-none" /></div>`
                : nothing}
            <div class="flex flex-col overflow-hidden text-ellipsis p-4">
                <span class="font-bold text-sm text-color text-ellipsis overflow-hidden">${card.title ? card.title : card.uri}</span>
                <span class="py-2 text-color text-sm text-ellipsis overflow-hidden">${card.description.split("\n")[0]}</span>
                <span class="text-xs text-color/50 text-ellipsis overflow-hidden">${new URL(card.uri).host}</span>
            </div>
        </div>
    </a>`;
}

const agent = new Agent({ serviceUri: "https://api.bsky.app" });

type BskyAuthor = {
    did: string;
    avatar?: string;
    displayName: string;
    handle?: string;
};

type BskyFacet = {
    features: { uri?: string; tag?: string }[];
    index: { byteStart: number; byteEnd: number };
};

type BskyRecord = {
    createdAt: string;
    text: string;
    facets?: BskyFacet[];
};

type BskyImage = {
    thumb: string;
    fullsize: string;
    alt: string;
    aspectRatio?: {
        width: number;
        height: number;
    };
};

type BskyViewRecord = {
    $type: "app.bsky.embed.record#viewRecord";
    uri: string;
    cid: string;
    author: BskyAuthor;
    value?: BskyRecord;
    embeds: {
        media?: { images: BskyImage[] };
        images?: BskyImage[];
        external?: BskyExternalCard;
        record?: BskyViewRecord | BskyViewRecordWithMedia;
    }[];
};

type BskyViewRecordWithMedia = {
    $type: "app.bsky.embed.record_with_media#viewRecord";
    record: BskyViewRecord;
};

type BskyExternalCard = {
    uri: string;
    title: string;
    description: string;
    thumb?: string;
};

type BskyPost = {
    uri: string;
    cid: string;
    author: BskyAuthor;
    record: BskyRecord;
    embed?: {
        media?: { images: BskyImage[] };
        images?: BskyImage[];
        external?: BskyExternalCard;
        record?: BskyViewRecord | BskyViewRecordWithMedia;
    };
    likeCount: number;
    replyCount: number;
    repostCount: number;
};

type BskyThreadPost = {
    parent?: BskyThreadPost;
    post: BskyPost;
    replies: BskyThreadPost[];
};

const contentLoader = html`<div class="flex space-x-4 animate-pulse w-[80%] max-w-[300px] m-auto py-4">
    <div class="rounded-full bg-gray h-10 w-10"></div>
    <div class="flex-1 space-y-6 py-1">
        <div class="h-2 bg-gray rounded"></div>
        <div class="space-y-3">
            <div class="grid grid-cols-3 gap-4">
                <div class="h-2 bg-gray rounded col-span-2"></div>
                <div class="h-2 bg-gray rounded col-span-1"></div>
            </div>
            <div class="h-2 bg-gray rounded"></div>
        </div>
    </div>
</div>`;

type ViewType = "tree" | "embed" | "unroll";

@customElement("skyview-app")
class App extends LitElement {
    static styles = [globalStyles];

    @query("#url")
    urlElement!: HTMLInputElement;

    @query("#viewTypeElement")
    viewTypeElement?: RadioButtonGroup;

    @state()
    error?: string;

    url: string | null = null;

    @state()
    loading = false;

    @state()
    thread?: BskyThreadPost;
    originalUri?: string;

    @state()
    copiedToClipboard = false;

    viewType: ViewType = "tree";

    @property()
    embed = false;

    constructor() {
        super();
        this.url = new URL(location.href).searchParams.get("url");
        this.viewType = new URL(location.href).searchParams.get("viewtype") as ViewType;
        if (!this.viewType) this.viewType = "tree";
    }

    firstUpdate = true;
    protected willUpdate(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (this.firstUpdate) {
            if (this.embed) this.viewType = "embed";
            if (this.url) this.load();
            this.firstUpdate = false;
        }
    }

    async load() {
        if (!this.url) {
            this.loading = false;
            this.error = "Sorry, couldn't load thread (no URL given)";
            return;
        }
        this.loading = true;
        this.originalUri = undefined;
        try {
            const tokens = this.url.replace("https://", "").split("/");
            const actor = tokens[2];
            let rkey = tokens[4];
            if (!actor || !rkey) {
                this.error = "Sorry, couldn't load thread (invalid URL)";
                return;
            }
            let did: DID;
            if (actor.startsWith("did:")) {
                did = actor as DID;
            } else {
                const response = await agent.rpc.get("com.atproto.identity.resolveHandle", {
                    params: {
                        handle: actor,
                    },
                });

                if (!response.success) {
                    this.error = "Sorry, couldn't load thread (invalid handle)";
                    return;
                }
                did = response.data.did;
            }

            this.originalUri = `at://${did}/app.bsky.feed.post/${rkey}`;
            let response: any | null = null;
            do {
                response = await agent.rpc.get("app.bsky.feed.getPostThread", {
                    params: {
                        uri: `at://${did}/app.bsky.feed.post/${rkey}`,
                        parentHeight: 1,
                        depth: 100,
                    },
                });

                if (!response) {
                    this.error = "sorry, couldn't load thread (empty response)";
                    return;
                }

                if (!response.success) {
                    this.error = "Sorry, couldn't load thread (invalid response)";
                    return;
                }

                if (!response.data.thread) {
                    this.error = "Sorry, couldn't load thread (invalid data)";
                    return;
                }

                if (response.data.thread.parent && this.viewType != "embed") {
                    const tokens = response.data.thread.parent.post.uri.replace("at://", "").split("/");
                    did = tokens[0];
                    rkey = tokens[2];
                    response = null;
                }
            } while (!response);

            this.thread = response.data.thread;
            if (!this.thread) {
                this.error = "Sorry, couldn't load thread (invalid thread)";
                return;
            }
            if (this.viewType == "embed") {
                if (
                    this.thread.post.record.text.includes("@skyview.social") &&
                    this.thread.post.record.text.includes("embed") &&
                    this.thread.parent
                ) {
                    this.thread = this.thread.parent;
                }
                this.thread.replies = [];
            }

            if (this.viewType == "unroll") {
                const posts: BskyThreadPost[] = [];
                posts.push(this.thread);
                while (true) {
                    const post = posts[posts.length - 1];
                    const next = post.replies.find((reply) => reply.post.author.did == post.post.author.did);
                    if (!next) break;
                    posts.push(next);
                }
                this.thread.replies = posts.length > 1 ? posts.slice(1, posts.length) : [];
                this.thread.replies.forEach((reply) => (reply.replies = []));
                const lastPost = this.thread.replies[this.thread.replies.length - 1];
                if (lastPost.post.record.text.includes("@skyview.social") && lastPost.post.record.text.includes("unroll")) {
                    this.thread.replies.pop();
                }
            }

            console.log(this.thread);
        } catch (e) {
            this.error = "Sorry, couldn't load thread (exception)";
            return;
        } finally {
            this.loading = false;
        }
    }

    render() {
        let content: TemplateResult = html``;
        if (this.loading) {
            content = html`<div class="align-top">${contentLoader}</div>`;
        } else if (this.error) {
            content = html`<div class="border border-gray bg-gray text-white p-4 rounded text-center">Error: ${this.error}</div>`;
        } else if (this.thread) {
            content = html` ${!this.embed
                ? html`<div class="mb-4 font-bold text-primary text-center cursor-pointer" @click=${() => this.copyToClipboard(location.href)}>
                          ${this.copiedToClipboard ? "Copied link to clipboard" : "Share"}
                      </div>
                      <radio-button-group
                          class="mx-auto"
                          id="viewTypeElement"
                          .selectedValue=${this.viewType}
                          .options=${["tree", "unroll", "embed"]}
                          @change=${this.changeView}
                      ></radio-button-group>
                      ${this.viewType == "embed"
                          ? html`<div class="text-center mt-4">Use this HTML code on your website, blog, etc. to embed the post below.</div>
                                <div class="bg-gray rounded border border-gray text-white text-sm overflow-auto font-mono my-4 p-4">
                                    <pre>
&lt;iframe
src=&quot;${location.protocol}//${location.host}/embed.html?url=${this.url}&quot;
style=&quot;border: none; outline: none; width: 400px; height: 600px&quot;
&gt;&lt;/iframe&gt;</pre
                                    >
                                    <button
                                        class="text-white bg-primary px-4 py-2 mt-2 rounded"
                                        @click=${() =>
                                            this.copyToClipboard(
                                                `<iframe src="${location.protocol}//${location.host}/embed.html?url=${this.url}" style="border: none; outline: none; width: 400px; height: 600px;"></iframe>`
                                            )}
                                    >
                                        Copy
                                    </button>
                                </div>`
                          : nothing} `
                : nothing}
            ${this.viewType == "unroll"
                ? this.unroll(this.thread)
                : this.postPartial(this.thread, this.viewType == "tree" ? this.originalUri : undefined)}`;
        } else {
            content = html`<div class="text-center">
                    View and share <a class="text-primary font-bold" href="https://bsky.app">BlueSky</a> threads without needing a BlueSky account.
                </div>
                <div class="flex mt-4">
                    <input
                        id="url"
                        class="flex-1 bg-black border border-gray/75 outline-none rounded-l px-2 py-2"
                        placeholder="URL of a BlueSky post"
                    />
                    <button class="align-center rounded-r bg-primary text-white px-4" @click=${this.viewPosts}>View</button>
                </div>
                <div class="text-center text-bold text-xl mt-8 mb-4">How it works (BlueSky mobile & web app)</div>
                <div class="flex flex-col gap-4">
                    <div class="mb-4">
                        Reply anywhere in a BlueSky thread and mention <a href="https://bsky.app/profile/skyview.social">@skyview.social</a> using one
                        of the following commands. The Skyview bot will reply to you with a link, which shows the BlueSky thread depending on your
                        command.
                    </div>
                    <div class="flex flex-col gap-2">
                        <div>
                            <code class="text-primary text-white bg-primary border border-primary rounded px-2 py-1">@skyview.social tree</code>
                        </div>
                        <div>
                            Shows the entire conversation as a nested tree. Great for seeing all comments in a thread.
                            <a
                                class="text-primary"
                                href="?url=https%3A%2F%2Fbsky.app%2Fprofile%2Fnroettgen.bsky.social%2Fpost%2F3kbu5y35yhl2u&viewtype=tree"
                                >Example</a
                            >
                        </div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <div>
                            <code class="text-primary text-white bg-primary border border-primary rounded px-2 py-1">@skyview.social unroll</code>
                        </div>
                        <div>
                            Only shows the top post and replies by the same author. Great for viewing long form content consisting of multiple chained
                            posts.
                            <a
                                class="text-primary"
                                href="?url=https%3A%2F%2Fbsky.app%2Fprofile%2Fbadlogic.bsky.social%2Fpost%2F3kbt2y7pw272q&viewtype=unroll"
                                >Example</a
                            >
                        </div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <div>
                            <code class="text-primary text-white bg-primary border border-primary rounded px-2 py-1">@skyview.social embed</code>
                        </div>
                        <div>
                            Only shows the post to which you reply with a mention of @skyview.social. Also shows HTML you can add to your own website
                            or blog to embed the post.
                            <a
                                class="text-primary"
                                href="http://localhost:8080/?url=https%3A%2F%2Fbsky.app%2Fprofile%2Fbadlogic.bsky.social%2Fpost%2F3kbshkdcqdz2h&viewtype=embed"
                                >Example</a
                            >
                        </div>
                    </div>
                </div>

                <div class="text-center text-bold text-xl mt-8 mb-4">How it works (this website)</div>
                <div>1. Open a post in the BlueSky app or on the BlueSky website</div>
                <div>2. Click the three dots</div>
                <div>3. Click "Share" and copy the URL</div>
                <img class="rounded border border-gray/50 m-2" src="tutorial.png" />
                <div>4. Paste the URL into the text field above and click "View"</div>
                <div>5. Set your preferred viewing type ("tree", "embed", "unroll") and share it by clicking "Share"</div>

                <div class="text-center text-bold text-xl mt-8 mb-4">Privacy on BlueSky (or lack thereof)</div>
                <div class="flex flex-col gap-4">
                    <p>
                        By design, all your BlueSky posts are available to anyone with an internet connection. They do not even need a BlueSky account
                        to view all your posts (and images). All they need is your BlueSky user name. This is by design. There is no privacy on
                        BlueSky.
                    </p>
                    <p>
                        Here's a
                        <a class="text-primary" href="https://bsky.app/profile/badlogic.bsky.social/post/3kbt22jdyuw2l">post of mine on BlueSky</a>.
                        You'll need an account to view it on the BlueSky website or in the BlueSky app.
                    </p>
                    <p>
                        And here is the
                        <a
                            class="text-primary"
                            href="https://bsky.social/xrpc/com.atproto.repo.getRecord?repo=badlogic.bsky.social&collection=app.bsky.feed.post&rkey=3kbt22jdyuw2l"
                            >same post, publically available to anyone with an internet connection</a
                        >. Yes, it reads like gibberish, but computer people can take this data and reconstruct all of the post's information. That's
                        essentially what Skyview does. Without needing a BlueSky account. Here is the
                        <a class="text-primary" href="/?url=https%3A%2F%2Fbsky.app%2Fprofile%2Fbadlogic.bsky.social%2Fpost%2F3kbt22jdyuw2l"
                            >same post viewed via Skyview</a
                        >.
                    </p>
                    <p>
                        Skyview runs directly in your browser. Everything you do happens directly on your device. Skyview does not collect any data
                        whatsovever. It also does not store any data users are viewing through it.
                    </p>
                    <p></p>
                </div>`;
        }

        return html`<main class="flex flex-col justify-between m-auto max-w-[728px] px-4 h-full">
            ${!this.embed || this.loading ? html`<a class="text-2xl text-primary font-bold text-center my-8" href="/">Skyview</a>` : nothing}
            <div class="flex-grow flex flex-col">${content}</div>
            <div class="text-center text-xs italic my-4 pb-4">
                <a class="text-primary" href="https://skyview.social" target="_blank">Skyview</a> is lovingly made by
                <a class="text-primary" href="https://bsky.app/profile/badlogic.bsky.social" target="_blank">Mario Zechner</a><br />
                No data is collected, not even your IP address.
                <a class="text-primary" href="https://github.com/badlogic/skyview" target="_blank"><br />Source code</a>
            </div>
        </main>`;
    }

    viewPosts() {
        if (!this.urlElement) return;

        const newUrl = new URL(location.href);
        newUrl.searchParams.set("url", this.urlElement.value);
        newUrl.searchParams.set("viewtype", "tree");
        location.href = newUrl.href;
    }

    changeView() {
        const el = this.viewTypeElement;
        if (!el) return;
        if (!this.url) return;

        const newUrl = new URL(location.href);
        newUrl.searchParams.set("url", this.url!);
        newUrl.searchParams.set("viewtype", el.selectedValue);
        location.href = newUrl.href;
    }

    defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;

    recordPartial(author: BskyAuthor, uri: string, record: BskyRecord, isQuote = false) {
        return html`<div class="flex items-center gap-2">
                <a class="flex items-center gap-2" href="https://bsky.app/profile/${author.handle ?? author.did}">
                    ${author.avatar ? html`<img class="w-[2em] h-[2em] rounded-full" src="${author.avatar}" />` : this.defaultAvatar}
                    <span class="text-primary">${author.displayName}</span>
                </a>
                <a class="text-xs text-primary/75" href="https://bsky.app/profile/${author.did}/post/${uri.replace("at://", "").split("/")[2]}"
                    >${getTimeDifferenceString(record.createdAt)}</a
                >
            </div>
            <div class="${isQuote ? "italic" : ""} mt-1">${unsafeHTML(processText(record))}</div>`;
    }

    postPartial(post: BskyThreadPost, originalUri?: string): HTMLElement {
        let images = post.post.embed?.images ? renderGallery(post.post.embed.images) : undefined;
        if (!images) images = post.post.embed?.media?.images ? renderGallery(post.post.embed.media.images) : undefined;
        let card = post.post.embed?.external ? renderCard(post.post.embed.external) : undefined;

        let quotedPost = post.post.embed?.record;
        if (quotedPost && quotedPost?.$type != "app.bsky.embed.record#viewRecord") quotedPost = quotedPost.record;
        const quotedPostAuthor = quotedPost?.author;
        const quotedPostUri = quotedPost?.uri;
        const quotedPostValue = quotedPost?.value;
        let quotedPostImages = quotedPost?.embeds[0]?.images ? renderGallery(quotedPost.embeds[0].images) : undefined;
        if (!quotedPostImages) quotedPostImages = quotedPost?.embeds[0]?.media?.images ? renderGallery(quotedPost.embeds[0].media.images) : undefined;
        let quotedPostCard = quotedPost?.embeds[0]?.external ? renderCard(quotedPost.embeds[0].external) : undefined;

        const postDom = dom(html`<div>
            <div class="flex flex-col mt-4 post min-w-[280px] ${post.post.uri == originalUri ? "border-r-4 pr-2 border-primary" : ""}">
                ${this.recordPartial(post.post.author, post.post.uri, post.post.record)} ${images ? html`<div class="mt-2">${images}</div>` : nothing}
                ${quotedPost
                    ? html`<div class="border border-gray/50 rounded p-4 mt-2">
                          ${this.recordPartial(quotedPostAuthor!, quotedPostUri!, quotedPostValue!, true)}
                          ${quotedPostImages ? html`<div class="mt-2">${quotedPostImages}</div>` : nothing}
                          ${quotedPostCard ? quotedPostCard : nothing}
                      </div>`
                    : nothing}
                ${card ? card : nothing}
            </div>
            ${post.replies.length > 0
                ? html`<div class="border-l border-dotted border-gray/50 pl-4">
                      ${map(post.replies, (reply) => this.postPartial(reply, originalUri))}
                  </div>`
                : nothing}
        </div>`)[0];

        return postDom;
    }

    unroll(post: BskyThreadPost) {
        const openPost = (url: string) => {
            location.href = url;
        };

        const postPartial = (post: BskyThreadPost, isQuote = false) => {
            let images = post.post.embed?.images ? renderGallery(post.post.embed.images, true) : undefined;
            if (!images) images = post.post.embed?.media?.images ? renderGallery(post.post.embed.media.images, true) : undefined;
            let card = post.post.embed?.external ? renderCard(post.post.embed.external) : undefined;
            const record = post.post.record;
            const uri = post.post.uri;
            const author = post.post.author;

            let quotedPost = post.post.embed?.record;
            if (quotedPost && quotedPost?.$type != "app.bsky.embed.record#viewRecord") quotedPost = quotedPost.record;
            const quotedPostAuthor = quotedPost?.author;
            const quotedPostUri = quotedPost?.uri;
            const quotedPostValue = quotedPost?.value;
            let quotedPostImages = quotedPost?.embeds[0]?.images ? renderGallery(quotedPost.embeds[0].images) : undefined;
            if (!quotedPostImages)
                quotedPostImages = quotedPost?.embeds[0]?.media?.images ? renderGallery(quotedPost.embeds[0].media.images) : undefined;
            let quotedPostCard = quotedPost?.embeds[0]?.external ? renderCard(quotedPost.embeds[0].external) : undefined;

            return html`
                <div
                    class="cursor-pointer flex flex-col post min-w-[280px] hover:bg-gray/20 py-2"
                    @click=${() => openPost(`https://bsky.app/profile/${author.did}/post/${uri.replace("at://", "").split("/")[2]}`)}
                >
                    <div class="${isQuote ? "italic" : ""}">${unsafeHTML(processText(record))}</div>
                    ${images ? html`<div class="mt-2">${images}</div>` : nothing}
                    ${quotedPost
                        ? html`<div class="border border-gray/50 rounded p-4 mt-2">
                              ${this.recordPartial(quotedPostAuthor!, quotedPostUri!, quotedPostValue!, true)}
                              ${quotedPostImages ? html`<div class="mt-2">${quotedPostImages}</div>` : nothing}
                              ${quotedPostCard ? quotedPostCard : nothing}
                          </div>`
                        : nothing}
                    ${card ? card : nothing}
                </div>
            `;
        };

        const author = post.post.author;
        const uri = post.post.uri;

        const postDom = dom(html`<div class="mt-4">
            <div class="flex items-center gap-2 mb-2">
                <a class="flex items-center gap-2" href="https://bsky.app/profile/${author.handle}">
                    ${author.avatar ? html`<img class="w-[2em] h-[2em] rounded-full" src="${author.avatar}" />` : this.defaultAvatar}
                    <span class="text-primary">${author.displayName}</span>
                </a>
                <a class="text-xs text-primary/75" href="https://bsky.app/profile/${author.did}/post/${uri.replace("at://", "").split("/")[2]}"
                    >${getTimeDifferenceString(post.post.record.createdAt)}</a
                >
            </div>
            <div>${postPartial(post)} ${map(post.replies, (reply) => postPartial(reply))}</div>
        </div>`)[0];
        return postDom;
    }

    copyToClipboard(text: string) {
        const input = document.createElement("input");
        input.value = text;

        document.body.appendChild(input);
        input.select();

        try {
            document.execCommand("copy");
            this.copiedToClipboard = true;
        } catch (err) {
            this.copiedToClipboard = false;
        } finally {
            document.body.removeChild(input);
        }
    }
}
