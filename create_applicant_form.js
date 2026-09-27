import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error("Usage: node create.js /absolute/path/output.docx");
}

const title = "Applicant Profile Form";
const palette = {
  dark: "263238",
  primary: "37474F",
  border: "D8E0E3",
  fill: "EEF3F6",
};

const font = {
  ascii: "Calibri",
  hAnsi: "Calibri",
  cs: "Calibri",
  eastAsia: "Microsoft YaHei",
};

const run = (text, options = {}) =>
  new TextRun({ text, font, size: 22, ...options });

const para = (children, options = {}) =>
  new Paragraph({
    spacing: { after: 120, line: 280 },
    ...options,
    children: Array.isArray(children) ? children : [children],
  });

const heading = (text, level = 1) =>
  para(run(text, { bold: true, size: level === 1 ? 28 : 24, color: palette.dark }), {
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
  });

// Two-column fill-in table: label column fixed, blank answer column.
const labelWidth = 3600;
const answerWidth = 5426;
const cell = (text, options = {}) =>
  new TableCell({
    children: text === "" ? [para(run("", { size: 22 }), { spacing: { after: 60, line: 280 } })] : [para(run(text, { size: 22 }), { spacing: { after: 60, line: 280 } })],
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    ...options,
  });

const labelCell = (text) =>
  cell(text, {
    shading: { type: ShadingType.CLEAR, fill: palette.fill },
    width: { size: labelWidth, type: WidthType.DXA },
  });

const blankCell = () => cell("", { width: { size: answerWidth, type: WidthType.DXA } });

const fillTable = (labels) =>
  new Table({
    width: { size: labelWidth + answerWidth, type: WidthType.DXA },
    columnWidths: [labelWidth, answerWidth],
    rows: labels.map((l) => new TableRow({ children: [labelCell(l), blankCell()] })),
  });

const note = (text) =>
  para(run(text, { italics: true, size: 20, color: palette.primary }));

const blankLines = (n) => {
  const lines = [];
  for (let i = 0; i < n; i++) {
    lines.push(
      para(run("", { size: 22 }), {
        spacing: { after: 120, line: 360 },
        border: { bottom: { style: "single", size: 4, color: palette.border } },
      }),
    );
  }
  return lines;
};

const personalInfo = [
  "First Name", "Last Name", "Age", "Birthdate",
  "Height (CM)", "Weight (KG)", "Nationality", "Religion",
  "Marital Status", "No. of Children", "Age of Children",
  "Contract Status (current location)", "Total Years Working Experience in HK",
  "Total Number of Employers in HK", "Education", "Study Major",
  "Overseas Work Experience",
];

const skillsSelfAssessment = [
  "Infant care", "Toddler care", "Child care",
  "Western Cooking", "Chinese Cooking", "Indian Cooking",
  "Household work", "Pet(s) care",
  "Language [Cantonese]", "Language [English]",
];

const jobPreference = [
  "Infant care", "Toddler care", "Child care",
  "Youth care", "Pet(s) care", "Cooking",
];

const currentExperience = [
  "Type of Release (Finished / Finishing / Terminated / Others)",
  "Time working for this employer",
  "Reason for Leaving",
  "Employer Nationality",
  "Number of Adults",
  "Number of Children",
  "Age of Children (when contract started)",
  "Number of Elderly",
  "Age of Elderly (when contract started)",
  "Duties and Responsibilities",
];

const longestExperience = [
  "Employer Nationality / Location",
  "Time working for this employer (from – to)",
  "Household Composition (adults / children & ages / elderly)",
  "Duties and Responsibilities",
  "Reason for Leaving",
];

const doc = new Document({
  sections: [
    {
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
      },
      headers: {
        default: new Header({
          children: [
            para(run(title, { bold: true, size: 20, color: palette.primary }), {
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            para(new TextRun({ children: [PageNumber.CURRENT], font, size: 20 }), {
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      children: [
        para(run(title, { bold: true, size: 34, color: palette.dark }), {
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        note("Please complete all sections below. Leave a field blank only if it does not apply to you."),

        // Section 1: Personal Information
        heading("1. Personal Information"),
        fillTable(personalInfo),

        // Section 2: Skills and Experience (Self-assessment)
        heading("2. Self-assessment of Skills and Experience"),
        note("For each skill, state your level (e.g. Very Experienced / Experienced / Somewhat Experienced / Less Experienced) and add a short note if you wish."),
        fillTable(skillsSelfAssessment),

        // Section 3: Job Preference
        heading("3. Job Preference"),
        note("Tell us how you feel about each task (e.g. I love it / I like it / I don't mind it / I prefer not)."),
        fillTable(jobPreference),

        // Section 4: Current / Most Recent Working Experience
        heading("4. Current / Most Recent Working Experience"),
        fillTable(currentExperience),

        // Section 5: Work History in Your Own Words
        heading("5. Work History Summary (in your own words)"),
        note("Describe your previous jobs in Hong Kong (and overseas) in reverse chronological order: employer, dates, household composition, main duties, and why you left."),
        ...blankLines(10),

        // Section 6: Longest Working Experience
        heading("6. Longest Working Experience"),
        note("Leave this section blank if your longest working experience is the same as your current / most recent one."),
        fillTable(longestExperience),

        para(run("Thank you for your time. Please return this completed form to us so we can prepare your profile for employer review.", { italics: true, size: 20, color: palette.primary }), {
          spacing: { before: 280 },
        }),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
