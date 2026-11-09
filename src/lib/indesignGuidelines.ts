// The MKule InDesign guidelines, transcribed from the section's shared document.
// Kept as data so the desk stays presentational and adding a step is a one-line
// change. `image` is a URL to a screenshot in public/guidelines/ — for example
// "/guidelines/first-line-left-indent-field.png" — and every step renders a
// picture slot whether or not that file exists yet. A step that only introduces
// a list is not numbered twice: its `sub` items are lettered bullets inside the
// same row.
export interface GuidelineStep {
  text: string;
  image?: string;
  sub?: GuidelineStep[];
}

export interface GuidelinePart {
  /** Lettered sub-heading inside a section, e.g. "A. Placing images". */
  heading?: string;
  steps: GuidelineStep[];
}

export interface GuidelineSection {
  id: string;
  title: string;
  intro?: string;
  parts: GuidelinePart[];
}

export const GUIDELINE_SECTIONS: GuidelineSection[] = [
  {
    id: "preparation",
    title: "I. Preparation and accessing the template",
    parts: [
      {
        steps: [
          { text: "Familiarize yourself with the basic layout structure of MKule issues for each page. Review previous issues to understand the standard arrangement, formatting, and design elements used throughout the publication." },
          { text: "Open the MKulayout website and access the MKule Issue Template GDrive link from your assigned issue task workspace." },
          { text: "Download and extract the template folder. Open the extracted folder and locate the Adobe InDesign (.indd) file." },
          { text: "Before editing, create a separate working copy of the downloaded template. Never overwrite or directly modify the original template file." },
          { text: "Open the InDesign file. Make sure all document fonts are installed and all linked files, including images, illustrations, and other graphics, are properly connected. If InDesign displays a missing-font or missing-link warning, resolve it before proceeding." },
          { text: "Familiarize yourself with the basic InDesign workspace, particularly the Tools panel, Properties panel, Layers panel, and other panels you will frequently use. If you cannot select or edit an element, check whether its layer or object is locked." },
          { text: "Check the page size, orientation, margins, and page arrangement. Do not change the existing document settings unless instructed by the layout editor." },
          { text: "IMPORTANT: Read the entire article assigned to you. Understand its content, structure, and intended message before beginning the layout. This will help you determine the appropriate visual direction and placement of elements." },
          { text: "Scroll down to the template of your assigned page and begin the layout design process. Make sure all necessary details and credits are properly placed.", image: "/guidelines/page-template-rulers.png" },
          {
            text: "Observe the appropriate design style for your assigned page:",
            sub: [
              { text: "News pages should be as formal, clean, and simple as possible." },
              { text: "Culture, Features, MM, and Grafx pages may be as creative as you want, provided that readability remains the top priority." },
              { text: "Standalone illustration pages should follow the separate instructions under Section IV." },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "article",
    title: "II. Inserting and formatting the article",
    parts: [
      {
        heading: "A. Inserting the article text",
        steps: [
          { text: "From the text template, click the article textbox and highlight all the existing black placeholder text before pressing Backspace to delete it. Repeat the process until only the red placeholder text remains. Make sure not to accidentally delete other template elements.", image: "/guidelines/placeholder-text-highlighted.png" },
          { text: "Access the Google Docs link of your assigned article (artx). Under the 4EIC tab, copy the entire article." },
          { text: "Return to the InDesign template file, click inside the article textbox, and paste the entire article. Make sure that no part of the article is missing.", image: "/guidelines/article-pasted-in-columns.png" },
          { text: "Locate the red placeholder text. Replace it with the first three to four words of the article, making sure that these words occupy only the first line and do not extend to the second line.", image: "/guidelines/red-placeholder-first-line.png" },
          { text: "Press Space after the inserted words, then delete the red placeholder text. This preserves the intended starting position of the article." },
        ],
      },
      {
        heading: "B. Formatting paragraph indentations",
        steps: [
          { text: "Go to the beginning of the second paragraph and press Backspace until the unnecessary indentation and blank line separating it from the first paragraph are removed. Be careful not to delete any actual article content.", image: "/guidelines/second-paragraph-beginning.png" },
          { text: "Open the Properties panel (usually located on the right side of the InDesign workspace). Scroll down until you reach the Paragraph section.", image: "/guidelines/properties-paragraph-panel.png" },
          { text: "Click anywhere inside the second paragraph. Under First Line Left Indent, enter 0.1875 in.", image: "/guidelines/first-line-left-indent-field.png" },
          { text: "Repeat this process for all succeeding paragraphs. Make sure that every paragraph has the correct first-line indentation and that all indentations are consistent throughout the article.", image: "/guidelines/paragraph-indent-repeat.png" },
        ],
      },
      {
        heading: "C. Adjusting the article textbox",
        steps: [
          { text: "Check the overall spacing of the article. If there is excessive white space within the page, adjust the height of the article textbox vertically to make better use of the available space. Adjust the textbox frame itself, not the actual text or its proportions.", image: "/guidelines/article-textbox-frame.png" },
          { text: "Make sure that when the textboxes are adjusted, each line remains properly aligned with the rest of the article and the corresponding textboxes on the other pages." },
          { text: "To check alignment, go to View > Show Rulers. Click and drag from the ruler area toward the article to create a guide. Use the guide to check whether the article lines are properly aligned with the template.", image: "/guidelines/view-show-rulers.png" },
          { text: "Once you are done checking, right-click on the gray blank space outside the page while making sure you are not selecting any element. Go to Grids and Guides > Hide Guides to hide the template line guides.", image: "/guidelines/hide-guides-menu.png" },
          { text: "Check the bottom-right corner of the article textbox for a red square containing a plus sign (+). This indicates overset text, meaning some of the article is not being displayed. If this appears, enlarge the textbox, adjust the layout, or reposition design elements to accommodate the remaining text. Never submit a page with missing or cut-off article content. If the article still does not fit, consult the layout editor before making major adjustments to the font size or spacing." },
        ],
      },
      {
        heading: "D. Adding the title, subtitle, and byline",
        steps: [
          { text: "You may position the title, subtitle, and byline at either the top or bottom part of the page, depending on the layout.", image: "/guidelines/title-byline-at-bottom.png" },
          { text: "Make sure the article textbox remains aligned with the corresponding article textboxes on the other pages. Leave sufficient spacing between the title, byline, and article text. Avoid placing these elements too close together." },
          { text: "Customize the title design according to the page theme. However, maintain consistent spacing between the title and byline even when repositioning them. Do not change the original font of the byline." },
          { text: "Maintain consistency in the article's font family, font size, leading, and paragraph formatting. Do not randomly change the article's font or font size just to accommodate the layout." },
          { text: "Avoid excessively tight or wide spacing between letters and words. Do not stretch or distort text to make it fit. Make sure the title, subtitle, byline, and article have a clear visual hierarchy." },
          { text: "Avoid leaving a single word or very short line alone at the beginning or end of a paragraph whenever possible. Adjust the layout to prevent awkward paragraph breaks." },
          { text: "Never remove, rewrite, shorten, or modify any part of the article without the approval of the assigned editor." },
        ],
      },
    ],
  },
  {
    id: "images",
    title: "III. Adding and formatting images and graphics",
    parts: [
      {
        heading: "A. Placing images",
        steps: [
          { text: "Go to File > Place. Select the image or graphic you want to insert, then click Open. You may also double-click the selected file.", image: "/guidelines/file-place-menu.png" },
          { text: "Once your cursor is holding the image, click on an empty area of the page to place it. Avoid clicking directly on existing text or other elements." },
          { text: "Always use the original, highest-quality image available from the designated Google Drive folder. Avoid screenshots, compressed images, or low-resolution copies whenever a higher-quality version is available." },
          { text: "Do not stretch images disproportionately. Always maintain their original aspect ratio. If an image appears pixelated or blurry, replace it with a higher-resolution version instead of enlarging it further." },
          { text: "Make sure images are positioned properly within the page boundaries. Do not accidentally crop important subjects or details. Do not use images from external sources without approval and proper attribution." },
        ],
      },
      {
        heading: "B. Understanding the Selection Tools",
        steps: [
          {
            text: "InDesign has two selection tools that serve different purposes:",
            image: "/guidelines/selection-tools.png",
            sub: [
              { text: "Selection Tool (black arrow): Use this to select, move, resize, and adjust the image frame. You can also reposition the image and crop it within its frame. The selected frame's border usually appears in the color assigned to its layer, commonly blue." },
              { text: "Direct Selection Tool (white arrow): Use this to select and adjust the actual image inside its frame. You can reposition, resize, and crop the image within the existing frame. The image itself and its frame controls become visible when selected." },
            ],
          },
          { text: "Remember: The Selection Tool adjusts the frame, while the Direct Selection Tool adjusts the image inside that frame." },
        ],
      },
      {
        heading: "C. Activating and adjusting Text Wrap",
        steps: [
          { text: "To activate Text Wrap, go to Edit > Preferences > Composition and check Text Wrap Only Affects Text Beneath. This ensures that Text Wrap only affects text positioned beneath the selected object." },
          { text: "Make sure your image has a transparent background whenever possible. If you have both a version with a background and a version without one, you may layer and align them accordingly to achieve the desired effect." },
          { text: "Go to Window > Text Wrap to open the Text Wrap panel. Select your image, then click Wrap Around Object Shape.", image: "/guidelines/window-text-wrap-menu.png" },
          { text: "Do not panic if the whole article temporarily disappears. The text has not been deleted; it is simply being pushed away by the Text Wrap." },
          { text: "Under Contour Options, select Alpha Channel. Adjust the Top Offset to your desired spacing, usually 0.4375 in.", image: "/guidelines/text-wrap-contour-options.png" },
          { text: "To access the article textbox again, use the Selection Tool to adjust the image frame and crop out unnecessary blank areas around the image.", image: "/guidelines/image-frame-crop-wrap.png" },
          { text: "If the full article is cut off or does not fit properly because of the spacing, go to Window > Type & Tables > Character and adjust the Tracking. The usual adjustment range is between -15 and -40. Avoid excessive tracking adjustments, as the text must remain readable. Consult the layout editor if the article still does not fit." },
          { text: "To adjust the spacing path created by Text Wrap, select the Direct Selection Tool. This will reveal the image's text-wrap boundary and its anchor points. Adjust the points carefully until the article text is properly displayed and follows the intended shape of the image." },
        ],
      },
      {
        heading: "D. Managing layers and arranging elements",
        steps: [
          { text: "Open Window > Layers to access the Layers panel. Familiarize yourself with the existing layers and identify which ones contain the background, article, images, and other design elements." },
          { text: "Use the appropriate layer when adding images, text, and other design elements. Avoid moving, deleting, or modifying existing template elements unless necessary." },
          { text: "When an object appears behind another object, use the appropriate Arrange command or layer controls to change its stacking order. You may also use Ctrl + [ to move an object one layer backward or Ctrl + ] to move it one layer forward." },
          { text: "Lock layers or elements that should no longer be modified to prevent accidental movement or deletion. If an object cannot be selected, check whether it or its layer is locked." },
        ],
      },
    ],
  },
  {
    id: "illustration",
    title: "IV. Standalone illustration pages",
    parts: [
      {
        steps: [
          { text: "For standalone illustration pages, simply place the illustration from the designated Illustration Google Drive folder into the page." },
          { text: "Make sure the entire illustration is properly positioned and fits within the page boundaries. Do not accidentally crop or cut off any important part of the illustration." },
          { text: "Adjust its size and positioning as necessary while maintaining its original proportions and intended composition." },
          { text: "Properly include the illustrator's credits in the designated area of the page." },
        ],
      },
    ],
  },
  {
    id: "finalize",
    title: "V. Finalizing the page design",
    parts: [
      {
        heading: "A. Applying the page theme",
        steps: [
          { text: "Adjust the colors of the remaining design elements according to the assigned page's theme color." },
          { text: "Maintain consistency in the use of colors, fonts, and other design elements throughout the page." },
          { text: "Always prioritize readability. Make sure that the article text and other important information remain clear and easy to read against the background." },
        ],
      },
      {
        heading: "B. Improving footer readability",
        steps: [
          { text: "Select the Rectangle Tool and draw a rectangle over the footer area where the credits and other footer elements are placed." },
          { text: "Under Appearance, locate the Fill option (the box with a diagonal red line). Double-click the Fill box to open the color settings and set the fill color to white (#FFFFFF)." },
          { text: "Go to Add an Object Effect to the Selected Target and select Gradient Feather. Adjust the Gradient Feather settings according to the provided reference screenshot." },
          { text: "Resize the rectangle vertically until it creates a subtle fading white background behind the footer elements. Make sure the fade does not overpower the page design." },
          { text: "Adjust the rectangle's layer position using Ctrl + [ to move it backward or Ctrl + ] to move it forward until it is directly behind the footer elements but above the page background." },
        ],
      },
      {
        heading: "C. Checking and correcting credits",
        steps: [
          { text: "Review all credits and make sure they follow the publication's proper credit format." },
          { text: "For images or photographs that are simply placed on the page without additional editing, include the appropriate photo or image credits." },
          { text: "For images or photographs that have been edited, manipulated, or incorporated into a designed composition with visual effects, include the appropriate design credits. Do not omit original photographer or image-source credits when required." },
          { text: "Double-check that all necessary credits, including those for photographs, illustrations, and other visual materials, are properly included." },
        ],
      },
    ],
  },
  {
    id: "checklist",
    title: "VI. Pre-export checklist",
    intro: "Before saving and exporting your completed design, check all the following:",
    parts: [
      {
        steps: [
          { text: "Make sure the entire article is displayed. No paragraphs, sentences, or words should be missing or cut off. Check for the red plus sign indicating overset text." },
          { text: "Check all titles, subtitles, bylines, captions, and credits for spelling and grammatical errors." },
          { text: "Make sure the article has consistent paragraph indentations, spacing, and typography." },
          { text: "Check whether all elements are properly aligned with the page template and corresponding pages." },
          { text: "Make sure no images, textboxes, or other elements accidentally extend beyond the page boundaries." },
          { text: "Check that all images are properly linked and displayed. Make sure there are no missing fonts or missing links." },
          { text: "Make sure no unnecessary guides, frames, or selection outlines are visible in the final exported PDF." },
          { text: "Make sure the footer, page number, and other required publication elements are present." },
          { text: "Review the overall design at both Fit Page and Actual Size views to check the overall appearance and readability." },
          { text: "Go to Window > Output > Preflight. Check the Preflight panel for document errors, particularly missing fonts, missing links, and overset text. Resolve all errors before exporting. If you cannot resolve an error, consult the layout editor." },
        ],
      },
    ],
  },
  {
    id: "submit",
    title: "VII. Saving, exporting, and submitting your design",
    parts: [
      {
        heading: "A. Saving the completed design",
        steps: [
          { text: "Once your page is finished, create a new folder for your completed page." },
          { text: "Save your InDesign document (.indd) inside this folder. Press Ctrl + S regularly to save your progress, especially after major changes." },
          { text: "Save a separate copy of the document in InDesign Markup Language (.idml) format. This allows compatibility with other InDesign versions." },
          { text: "Export your completed design as a PDF." },
          {
            text: "Make sure the PDF is exported in color and follows its designated page format:",
            sub: [
              { text: "Single page – Export as one page." },
              { text: "Spread – Export as a spread." },
            ],
          },
          { text: "Before exporting, use the PDF export preset designated by the publication. Do not change the document's color settings or export settings without consulting the layout editor." },
          { text: "If the design requires bleed, make sure the document's existing bleed settings are followed. Do not change the bleed settings unless instructed." },
          { text: "After exporting, open the PDF and inspect the entire page. Check for missing images, incorrect colors, unexpected white spaces, cut-off text, and other formatting changes. Never assume that the exported PDF is correct simply because the InDesign file looks correct." },
          {
            text: "Your completed folder must contain the following three main files:",
            sub: [
              { text: "INDD – Editable InDesign document." },
              { text: "IDML – InDesign-compatible document copy." },
              { text: "PDF – Final exported page design." },
            ],
          },
        ],
      },
      {
        heading: "B. Organizing fonts and linked files",
        steps: [
          { text: "Make sure all fonts and linked files used in your document are included in the completed page folder." },
          {
            text: "Create the following two subfolders inside your page folder:",
            sub: [
              { text: "Document fonts – Contains the fonts used in your InDesign document, subject to font licensing restrictions." },
              { text: "Links – Contains all linked images, illustrations, photographs, and other graphics used in the design." },
            ],
          },
          { text: "You may use File > Package to collect the InDesign document, linked graphics, and eligible fonts into one organized folder. Follow the packaging instructions and verify that the collected files are complete. Some fonts cannot be packaged because of licensing restrictions. If this happens, inform the layout editor instead of attempting to bypass the restrictions." },
          { text: "Double-check that all necessary fonts and linked files are included and properly organized before submission." },
        ],
      },
      {
        heading: "C. Uploading and completing the task",
        steps: [
          { text: "Upload the entire completed page folder, including the INDD, IDML, PDF, Document fonts, and Links folders, to the designated Google Drive submission folder." },
          { text: "Make sure the uploaded folder contains all the required files and that the final PDF is properly exported and viewable." },
          { text: "Return to the MKulayout website and click Mark as Accomplished to officially complete your assigned page task." },
        ],
      },
    ],
  },
  {
    id: "shortcuts",
    title: "VIII. Basic InDesign shortcuts and reminders",
    parts: [
      {
        steps: [
          { text: "Ctrl + S – Save your InDesign document." },
          { text: "Ctrl + Z – Undo your previous action." },
          { text: "Ctrl + Shift + Z – Redo your previous action." },
          { text: "Ctrl + G – Group selected objects." },
          { text: "Ctrl + Shift + G – Ungroup selected objects." },
          { text: "Ctrl + [ – Move the selected object one stacking level backward." },
          { text: "Ctrl + ] – Move the selected object one stacking level forward." },
          { text: "Alt + Drag – Duplicate an object by holding Alt while dragging it." },
          { text: "Always save your work regularly, especially before making major adjustments." },
          { text: "If you accidentally move, delete, or modify an element, use Ctrl + Z immediately to undo the action." },
          { text: "If you encounter an issue that you cannot resolve, do not randomly change document settings or delete template elements. Consult the layout editor first." },
        ],
      },
    ],
  },
];
