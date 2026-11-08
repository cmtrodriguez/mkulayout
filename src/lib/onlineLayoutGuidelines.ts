// The online pub guidelines, transcribed from the online layout desk's notes.
// Same shape as the InDesign guidelines, but deliberately one flat list with no
// lettered parts, so every rule keeps its own number and only the four-corner
// colour note sits underneath the rule it qualifies.
import type { GuidelineSection } from "./indesignGuidelines";

export const ONLINE_LAYOUT_SECTIONS: GuidelineSection[] = [
  {
    id: "online",
    title: "Online pub standards",
    parts: [
      {
        steps: [
          { text: "Always remember to read the whole artx first before starting, then refer to the brandkit for quick reminders." },
          { text: "If the assigned online pub is already part of an issue that has been released, contact the layout editor or layout deputy regarding its issue design." },
          { text: "If it is an issue artx, make sure it follows the same design as much as possible." },
          { text: "Refer to past/previous online pubs for reference." },
          {
            text: "Make sure the four-corner elements (Top Left: Category, Top Right: Credits, Bottom Left: Social Media, Bottom Right: MKule Logo) are in place, as in previous pubs, and do not move them from their original positions.",
            sub: [
              { text: "You may change their colors, as long as you use one theme color for all of them or throughout the whole pub." },
            ],
          },
          { text: "Make sure the category and credits are correct according to the language of the artx (Tagalog: Kultura, Lathalain, Balita, Disenyo, Dibuho, Larawan, etc.; English: Culture, Features, News, Design, Illustration, Photo)." },
          { text: "Access the graphic elements through the workspace of your assigned task (illustration/photo GDrive link, etc.)." },
          { text: "You can be as creative as you want with the title design, but always prioritize readability." },
          { text: "The previous guideline also applies to the subtitle design, but make sure to pair the title and subtitle nicely (e.g., if the title design is heavily stylized, keep the subtitle design simpler)." },
          { text: "Always make sure to indicate the correct writer in the byline and adjust the rounded rectangle around it to provide enough horizontal spacing. Do not adjust it vertically unless needed (e.g., when there are two or more writers). Refer to past/previous pubs if necessary." },
          { text: "For photos/images, include photo credits when a photo is simply placed without any effects. However, if the photo/image has effects or has been edited or designed, include only design credits." },
        ],
      },
    ],
  },
];
