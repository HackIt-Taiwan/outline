import { Event } from "@server/types";
import BaseProcessor from "./BaseProcessor";

export default class AvatarProcessor extends BaseProcessor {
  static applicableEvents: Event["name"][] = [];

  async perform(_event: Event) {
    // Avatar uploads are intentionally disabled – we keep the provider URL.
  }
}
