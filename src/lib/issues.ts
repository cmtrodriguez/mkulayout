// The published issues the layout team assesses. Google Drive renders the first page
// of a shared PDF at its thumbnail endpoint, so the front cover is a plain image; the
// remaining pages come through /api/issue-pdf (see lib/issuePages.ts).
export interface IssueFile {
  key: string;
  label: string;
  fileId: string;
  url: string;
}

export const ISSUES: IssueFile[] = [
  {
    key: "1k1-2",
    label: "1K1-2",
    fileId: "1eHUhpqFtPEj07uCG9Hoc47sweVbzc59y",
    url: "https://drive.google.com/file/d/1eHUhpqFtPEj07uCG9Hoc47sweVbzc59y/view?usp=drive_link",
  },
  {
    key: "1k3-4",
    label: "1K3-4",
    fileId: "1z8baF1AbGRy9T2wh6my6zfH9ooWO4uO1",
    url: "https://drive.google.com/file/d/1z8baF1AbGRy9T2wh6my6zfH9ooWO4uO1/view?usp=drive_link",
  },
  {
    key: "1k5",
    label: "1K5",
    fileId: "1oDTnQQ2oJmv9OwAOzOmpZVdABh2FUq8v",
    url: "https://drive.google.com/file/d/1oDTnQQ2oJmv9OwAOzOmpZVdABh2FUq8v/view?usp=drive_link",
  },
];

export const ISSUE_FILES: Record<string, IssueFile> = Object.fromEntries(
  ISSUES.map((issue) => [issue.key, issue])
);
