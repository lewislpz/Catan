import { describe, expect, it } from "vitest";

import {
  ROOM_NAMES,
  type MatchClientMessageMap,
  type MatchServerMessageMap,
  type MessageByType
} from "./index";

describe("shared protocol", () => {
  it("defines stable room names for gateway and match", () => {
    expect(ROOM_NAMES.gateway).toBe("hexaforge_gateway");
    expect(ROOM_NAMES.match).toBe("hexaforge_match");
  });

  it("keeps match message envelopes strongly typed", () => {
    const clientMessage: MessageByType<MatchClientMessageMap, "set_ready"> = {
      type: "set_ready",
      payload: {
        request_id: "req-1",
        ready: true
      }
    };

    const serverMessage: MessageByType<MatchServerMessageMap, "command_ok"> = {
      type: "command_ok",
      payload: {
        request_id: "req-1",
        events: []
      }
    };

    expect(clientMessage.payload.ready).toBe(true);
    expect(serverMessage.type).toBe("command_ok");
  });
});
