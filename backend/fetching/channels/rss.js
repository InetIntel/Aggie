const { PollChannel } = require('downstream');
const { default: SocialMediaPost } = require('downstream/build/builtin/post');
const RssParser = require('rss-parser');
const Report = require('../../models/report');
const { query } = require('express');
const { mongoose } = require('../../database');

/**
 * A Channel that polls the RSS feed of a list of URLs.
 */
class RSSChannel extends PollChannel {

    // This is ms so 10000 ms = 100 seconds
    static INTERVAL = 100000;
  
    // This is effectively just a string search
    regexQuery = null;

    rssList = [];
    
    lastFetched = {};

    parser = new RssParser();

    
    constructor(options) {
        super({...options,
            namespace: options.namespace || `rss-${options.rssList}`,
        });
        // Reformats the RSS feed URLs to include '/feed' at the end and to remove any trailing '/'
        this.rssList = options.rssList.split(' ').map(url => {
            let formattedUrl = url;
            // let formattedUrl = url.endsWith('/feed') ? url : `${url.replace(/\/$/, '')}/feed`;
            if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
            formattedUrl = `https://${formattedUrl}`;
            }
            return formattedUrl;
        });
        this.interval = options.interval || RSSChannel.INTERVAL;
        this.regexQuery = options.regex || null;
        // Last fetched is a dictionary of the last time each RSS feed was fetched
        // Loop through rss feed and initialize each to 0
        for (const rssUrl of this.rssList) {
            this.lastFetched[rssUrl] = 0;
        }
    }   

    async fetch() {
        const posts = [];
        for (const rssUrl of this.rssList) {
            try {
                // console.log("RSS FEED URLS")
                // console.log(this.rssList)
                console.log(`Fetching from ${rssUrl}`);
                const rawFeed = await this.parser.parseURL(rssUrl);
                const now = new Date();
                var regexFilteredCount = 0;
                for (const raw of rawFeed.items) {
                    raw.fetchedAt = now;
                    // Check whether the query parameter keywords are in the content or the title of the post using regex matching
                    let contentSnippet = raw["content:encodedSnippet"] || raw["contentSnippet"];
                    raw.contentSnippet = contentSnippet;
                    const regex = new RegExp(this.regexQuery, 'gi');
                    if (this.regexQuery && !regex.test(raw.contentSnippet) && !regex.test(raw.content) && !regex.test(raw.title)) {
                        regexFilteredCount++;
                        continue;
                    }

                    const guid = raw.guid || raw.link || null;
                    if (guid == null) {
                        console.log("No guid or link found in RSS post");
                        console.log(raw);
                        continue;
                    }

                    const formatted_rss = this.parse(raw);

                    if (!formatted_rss) {
                        console.log("Could not parse RSS post");
                        continue;
                    }
                    // Search if guid exists in mongodb
                    mongoose.connection.db.collection('reports').findOne({ 'guid': guid }, (err, post) => {
                        if (err) {
                            console.log(err);
                        }
                        if (post) {
                        } else {
                            console.log(`Found new post, adding ${guid} to queue`);
                            posts.push(formatted_rss);
                            this.enqueue(formatted_rss);
                        }
                    });
                }
                console.log(`From site ${rssUrl}, Had total of ${rawFeed.items.length} to be checked against db async, ${regexFilteredCount} filtered out through the regex of ${this.regexQuery}.`);
            } catch (e) {
                console.log(e);
            }
        }
        return posts;
    }

    /**
     * Parse the given raw message into a SocialMediaPost.
     */
    parse(rawMessage) {
        const now = new Date();
    
        const authoredAt = new Date(rawMessage.pubDate);
        // parse the rawmessage of keys that start with $ and replace them with ''
        
        rawMessage = JSON.parse(JSON.stringify(rawMessage).replace(/\$/g, ''));

        return new SocialMediaPost({
            authoredAt,
            fetchedAt: rawMessage.fetchedAt,
            author: rawMessage.creator,
            content: rawMessage.contentSnippet || rawMessage.content || rawMessage.title,
            url: rawMessage.link,
            platform: "RSS",
            platformID: rawMessage.guid || rawMessage.link || null,
            // base: rawMessage.guid || rawMessage.link || null,
            raw: rawMessage,
        }
        );
    }
}

module.exports = RSSChannel;
