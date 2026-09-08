import { describe, expect, it } from "vitest";

import { attachmentDisposition, downloadFilename } from "./asset-capability-service";

describe("Asset capability headers", () => {
  it("uses canonical extensions without trusting creator suffixes", () => {
    expect(downloadFilename("campaign.pdf", "JPEG")).toBe("campaign.pdf.jpg");
    expect(downloadFilename("clip.MP4", "MP4")).toBe("clip.MP4");
  });

  it("creates safe ASCII and UTF-8 Content-Disposition for Persian names", () => {
    const disposition = attachmentDisposition(downloadFilename("ویدیو راست‌به‌چپ", "MP4"));
    expect(disposition).toMatch(/filename="[_ ]+\.mp4"/);
    expect(disposition).toContain("filename*=UTF-8''%D9%88");
    expect(attachmentDisposition("bad\r\nX-Test: x.mp3")).not.toContain("\r");
  });
});
