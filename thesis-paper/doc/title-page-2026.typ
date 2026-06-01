#let title-page(
  program-code: "",
  program-ru: "",
  program-en: "",
  work-ru: "",
  work-en: "",
  specialty-ru: "",
  specialty-en: "",
  topic-ru: "",
  topic-en: "",
  author-ru: "",
  author-en: "",
  supervisor-ru: "",
  supervisor-en: "",
  consultants: "",
  year: "",
) = {
  set page(paper: "a4", margin: (top: 2.5cm, bottom: 1cm))
  set text(size: 14pt)

  align(center)[
    *Автономная некоммерческая организация высшего образования* \
    *«Университет Иннополис»*

    *ВЫПУСКНАЯ КВАЛИФИКАЦИОННАЯ РАБОТА* \
    *(#work-ru)* \
    по направлению подготовки \
    *#program-code – «#program-ru»*

    *FINAL QUALIFICATION WORK* \
    *(#work-en)* \
    *Academic Program* \
    *#program-code – “#program-en”*

    *Направленность (профиль) образовательной программы* \
    *«#specialty-ru»* \
    *Field of Study:* \
    *“#specialty-en”*

    #grid(
      columns: (0.5fr, 5fr),
      column-gutter: 7pt,
      [#box(inset: 4pt)[*Тема / Topic*]],
      [#align(left)[#box(stroke: 0.5pt + black, fill: silver, width: 100%, inset: 6pt)[
        *#topic-ru / #topic-en*
      ]]],
    ) \
    #grid(
      columns: (1fr, 1.5fr, 1fr),
      column-gutter: (20pt, 1pt, 1pt),
      [#box(inset: (left: 1pt, right: 1pt))[#align(left)[Работу выполнил / Prepared by]]],
      [
        #align(left)[
          #box(stroke: 0.5pt + black, fill: silver, width: 100%, height: 30mm, inset: 6pt)[
            *#author-ru / #author-en*
          ]
        ]],

      [#box(stroke: 0.5pt + black, height: 30mm, fill: silver, inset: (bottom: 10pt, right: 20pt, left: 20pt))[
          #align(bottom)[#text(size: 8pt, fill: black)[подпись / signature]]]
      ],
    )
    #grid(
      columns: (1fr, 1.5fr, 1fr),
      column-gutter: (20pt, 1pt, 1pt),
      [#box(inset: (left: 1pt, right: 1pt))[#align(
        left,
      )[Руководитель выпускной квалификационной работы / Final Qualification Work Supervisor]]],
      [
        #align(left)[
          #box(stroke: 0.5pt + black, fill: silver, width: 100%, height: 35mm, inset: 6pt)[
            *#supervisor-ru / #supervisor-en*
          ]
        ]],

      [#box(stroke: 0.5pt + black, height: 35mm, fill: silver, inset: (bottom: 10pt, right: 20pt, left: 20pt))[
          #align(bottom)[#text(size: 8pt, fill: black)[подпись / signature]]]
      ],
    )

    #if (consultants != "") {
      grid(
        columns: (1fr, 1.5fr, 1fr),
        column-gutter: (20pt, 1pt, 1pt),
        [#box(inset: (left: 1pt, right: 100pt))[#align(left)[Консультанты / Consultants]]],
        [
          #align(left)[
            #box(stroke: 0.5pt + black, fill: silver, width: 100%, height: 30mm, inset: 6pt)[
              *#consultants*
            ]
          ]],

        [#box(stroke: 0.5pt + black, height: 30mm, fill: silver, inset: (bottom: 10pt, right: 20pt, left: 20pt))[
            #align(bottom)[#text(size: 8pt, fill: black)[подпись / signature]]]
        ],
      )
    }

    #align(bottom)[Иннополис, Innopolis, #year]
  ]
}