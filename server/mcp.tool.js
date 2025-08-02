import {config} from 'dotenv';
import {TwitterApi }from 'twitter-api-v2';

config();

const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
})

export async function createPost(status){
    const newPost = await twitterClient.v2.tweet(status);

    return {
        content: [
            {
                type: "text",
                text: `Tweet created with ID: ${newPost.data.id} and text: ${status}`
            }
        ]
    }
}

export async function getTweets(){
    try {
        // Get the authenticated user's ID first, as it's needed for user_timeline
        const { data: user } = await twitterClient.v2.me();
        const userId = user.id;
        console.log(`Fetching tweets for user ID: ${userId}`);

        
        const userTimeline = await twitterClient.v2.userTimeline(userId, {
            'tweet.fields': ['created_at', 'text', 'author_id', 'id'], 
            max_results: 10 
        });

        const tweets = [];
        for await (const tweet of userTimeline) {
            tweets.push({
                id: tweet.id,
                text: tweet.text,
                createdAt: tweet.created_at,
                authorId: tweet.author_id
            });
        }

        if (tweets.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: "No tweets found."
                    }
                ],
                success: false
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Fetched ${tweets.length} tweets.`
                },
                {
                    type: "text",
                    text: JSON.stringify(tweets, null, 2)
                }
            ],
            tweets: tweets, 
            success: true
        };
    } catch (error) {
        console.error("Error fetching tweets:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to fetch tweets: ${error.message}`
                }
            ],
            success: false,
            error: error
        };
    }
}