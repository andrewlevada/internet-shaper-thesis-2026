// Innopolis University bachelor thesis title page (BS_Thesis_title_page_2026.docx).
// Overrides @preview/modern-innopolis-thesis:0.1.1 title-page layout.

#let title-gray = rgb("#D9D9D9")

#let field-box(body, height: auto) = box(
  stroke: 0.5pt + black,
  fill: title-gray,
  width: 100%,
  height: height,
  inset: 6pt,
  align(left + top)[#set text(weight: "bold"); #body],
)

#let signature-box(height) = box(
  stroke: 0.5pt + black,
  fill: title-gray,
  width: 100%,
  height: height,
  inset: (bottom: 10pt, left: 20pt, right: 20pt),
  align(bottom)[#text(size: 8pt)[подпись / signature]],
)

#let topic-row(label, body) = grid(
  columns: (auto, 1fr),
  column-gutter: 7pt,
  align(left + horizon)[#text(weight: "bold")[#label]],
  field-box(body),
)

#let signature-row(label-ru, label-en, body, height) = grid(
  columns: (1fr, 1.5fr, 1fr),
  column-gutter: (20pt, 1pt, 1pt),
  align(left + horizon)[
    #label-ru \
    #text(style: "italic")[#label-en]
  ],
  field-box(body, height: height),
  signature-box(height),
)

#let title-page(
  program-code: "",
  program-ru: "",
  program-en: "",
  specialty-ru: "",
  specialty-en: "",
  topic-ru: "",
  topic-en: "",
  author-ru: "",
  author-en: "",
  supervisor-ru: "",
  supervisor-en: "",
  consultants: none,
  year: "",
  font-family: "Times New Roman",
) = {
  set page(
    paper: "a4",
    margin: (
      top: 2.5cm,
      bottom: 1cm,
      left: 2.5cm,
      right: 2cm,
    ),
  )
  set text(size: 14pt, font: font-family)
  set par(leading: 0.55em, spacing: 0.55em)

  [
    #align(center)[
      #set par(leading: 0.55em, spacing: 0.55em)
      *Автономная некоммерческая организация высшего образования* \
      *«Университет Иннополис»* \
      *ВЫПУСКНАЯ КВАЛИФИКАЦИОННАЯ РАБОТА* \
      *(БАКАЛАВРСКАЯ РАБОТА)* \
      по направлению подготовки \
      *#program-code «#program-ru»* \
      *FINAL QUALIFICATION WORK* \
      *(BACHELOR'S THESIS)* \
      *Academic Program* \
      *#program-code «#program-en»* \
      *Направленность (профиль) образовательной программы* \
      *«#specialty-ru»* \
      *Field of Study:* \
      *«#specialty-en»*
    ]

    #v(0.5em)
    #topic-row[Тема][#topic-ru]
    #v(0.25em)
    #topic-row[Topic][#topic-en]
    #v(0.5em)

    #signature-row(
      [Работу выполнил /],
      [Prepared by],
      [#author-ru / #author-en],
      22mm,
    )
    #v(0.15em)
    #signature-row(
      [Руководитель выпускной квалификационной работы /],
      [Final Qualification Work Supervisor],
      [#supervisor-ru / #supervisor-en],
      24mm,
    )
    #v(0.15em)
    #signature-row(
      [Консультанты],
      [Consultants],
      if consultants != none { consultants } else { [] },
      22mm,
    )

    #v(0.4em)
    #align(center)[Иннополис, Innopolis, #year]
  ]
}
