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
import { faGlobe, faRss } from "@fortawesome/free-solid-svg-icons";

const mediaIcons: Record<MediaOptions, IconDefinition | BrandsDef> = {
  tiktok: faTiktok,
  instagram: faInstagram,
  youtube: faYoutube,
  twitter: faTwitter,
  RSS: faRss,
  OONI: faGlobe,
  facebook: faFacebook,
  truthsocial: faQuestionCircle,
  // elmo: faQuestionCircle,
  // "SMS GH": faQuestionCircle,
};

const SocialMediaIcon = ({
  mediaKey,
}: {
  mediaKey: MediaOptions | undefined;
}) => {
  if (!!mediaKey && mediaKey in mediaIcons) {
    //@ts-ignore
    return <FontAwesomeIcon icon={mediaIcons[mediaKey]} />;
  }
  return <FontAwesomeIcon icon={faQuestionCircle} />;
};

export default SocialMediaIcon;
