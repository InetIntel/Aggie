import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { MediaOptions } from "../../api/common";
import {
  faFacebook,
  faInstagram,
  faTiktok,
  faTwitter,
  faYoutube,
  type IconDefinition as BrandsDef,
} from "@fortawesome/free-brands-svg-icons";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faRss } from "@fortawesome/free-solid-svg-icons";

const mediaIcons: Record<MediaOptions, IconDefinition | BrandsDef> = {
  tiktok: faTiktok,
  instagram: faInstagram,
  youtube: faYoutube,
  twitter: faTwitter,
  RSS: faRss,
  facebook: faFacebook,
  truthsocial: faQuestionCircle,
  IODA: faQuestionCircle,
};

const SocialMediaIcon = ({
  mediaKey,
}: {
  mediaKey: MediaOptions | undefined;
}) => {
  if (!!mediaKey && mediaKey in mediaIcons) {
    if (mediaKey == "IODA") {
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
