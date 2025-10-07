import { Report } from "../../api/reports/types";
import YouTube, { YouTubeProps } from "react-youtube";
import Linkify from "linkify-react";
import { useState } from "react";
import AggieButton from "../AggieButton";

interface IProps {
  report: Report;
}
const YoutubePost = ({ report }: IProps) => {
  const { title, description } = parseYoutube(report);
  const [expand, setExpand] = useState(false);
  return (
    <>
      <p className='font-medium mb-2'>{title}</p>

      <p
        className={`text-slate-900 whitespace-pre-line break-all mb-2 ${
          expand ? "" : "line-clamp-5"
        }`}
      >
        <Linkify
          key={report._id}
          options={{
            target: "_blank",
            className: "underline text-blue-600 hover:bg-slate-100 dark:hover:bg-gray-700",
          }}
        >
          {description}
        </Linkify>
      </p>
      {!expand && description.length > 100 && (
        <AggieButton
          padding='px-0 py-0'
          className='text-sm underline text-blue-700 hover:bg-slate-200 dark:hover:bg-gray-600 '
          onClick={() => setExpand(true)}
        >
          Expand Text
        </AggieButton>
      )}
      <div className='w-full aspect-video overflow-hidden rounded'>
        <YoutubeVideo src={report.url} />{" "}
      </div>
    </>
  );
};

export default YoutubePost;
// -- youtube embed component
const YoutubeVideo = (props: { src: string }) => {
  // i stole this from https://github.com/jmorrell/get-youtube-id
  function parseUrl(url: string) {
    const patterns = [
      /youtu\.be\/([^#\&\?]{11})/, // youtu.be/<id>
      /\?v=([^#\&\?]{11})/, // ?v=<id>
      /\&v=([^#\&\?]{11})/, // &v=<id>
      /embed\/([^#\&\?]{11})/, // embed/<id>
      /\/v\/([^#\&\?]{11})/, // /v/<id>
    ];

    // If any pattern matches, return the ID
    for (const pattern of patterns) {
      if (pattern.test(url)) {
        const result = pattern.exec(url);
        if (!result) return undefined;
        return result[1];
      }
    }
    return undefined;
  }
  const onPlayerReady: YouTubeProps["onReady"] = (event) => {
    // access to player in all event handlers via event.target
    event.target.pauseVideo();
  };

  const opts: YouTubeProps["opts"] = {
    height: "100%",
    width: "100%",
    //   playerVars: {
    //     // https://developers.google.com/youtube/player_parameters
    //     autoplay: 0,
    //   },
  };

  const id = parseUrl(props.src);
  if (!id) return <></>;
  return (
    <YouTube
      videoId={id}
      opts={opts}
      onReady={onPlayerReady}
      className='h-full w-full'
    />
  );
};

/// youtube parser

export function parseYoutube(report: Report) {
  const rawPostData = (report.metadata.rawAPIResponse.attributes as any)
    ?.post_data;
  const youtubeData = rawPostData.snippet.data;
  return {
    title: youtubeData.title,
    description: youtubeData.description,
  };
}
