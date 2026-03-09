import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTwitter,
  faTelegram,
  faCloudflare,
  type IconDefinition as BrandsDef,
} from "@fortawesome/free-brands-svg-icons";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faRss } from "@fortawesome/free-solid-svg-icons";

const mediaIcons: Record<string, IconDefinition | BrandsDef> = {
  // tiktok: faTiktok,
  // instagram: faInstagram,
  // youtube: faYoutube,
  // RSS: faRss,
  // facebook: faFacebook,
  // truthsocial: faQuestionCircle,
  twitter: faTwitter,
  telegram: faTelegram,
  telegramBot: faTelegram,
  ioda: faQuestionCircle,
  cloudflare: faCloudflare,
};

const SocialMediaIcon = ({
  mediaKey,
}: {
  mediaKey: string | undefined;
}) => {
  if (!!mediaKey && mediaKey in mediaIcons) {
    if (mediaKey == "ioda") {
      return <img src="https://ioda.inetintel.cc.gatech.edu/icon-32-new.png"
        alt="IODA-icon"
        style={{
          boxSizing: "content-box",
          display: "inline-block",
          height: "1.125em",
          overflow: "visible",
          verticalAlign: "-0.125em"
        }} />;
    }
    //@ts-ignore
    return <FontAwesomeIcon icon={mediaIcons[mediaKey]} />;
  }
  return <FontAwesomeIcon icon={faQuestionCircle} />;
};

export default SocialMediaIcon;
