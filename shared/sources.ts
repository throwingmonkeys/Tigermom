// AGENTS.md Section 1 is authoritative. A regression test checks all 24 URLs.
export const referenceSources = [
  { title: "ACOG", url: "https://www.acog.org/", description: "US obstetric guidance; identify the specific guideline, date and whom it applies to." },
  { title: "FOGSI", url: "https://www.fogsi.org/", description: "Indian obstetric and gynaecological guidance; give relevant Indian guidance particular attention." },
  { title: "Lamaze", url: "https://lamaze.org/", description: "Childbirth education, preparation, informed choices and evidence supporting physiological birth." },
  { title: "Evidence Based Birth", url: "https://evidencebasedbirth.com/", description: "Link-only resource: do not copy, scrape or ingest its content into AI without permission." },
  { title: "WHO", url: "https://www.who.int/teams/sexual-and-reproductive-health-and-research-(srh)/overview", description: "Global reproductive and maternal-health guidance; explain relevant country differences." },
  { title: "Euro-Peristat", url: "https://www.europeristat.com/", description: "European population-level birth data; compare similar populations and definitions, never individual risk." },
  { title: "Cochrane", url: "https://www.cochrane.org/about-us/who-we-are/our-groups#review", description: "Find specific systematic reviews and explain certainty and gaps; this starting page is not evidence for a medical claim." },
  { title: "PubMed Central", url: "https://pmc.ncbi.nlm.nih.gov/", description: "Research papers: assess methods, population, date and relevance; inclusion alone does not establish quality." },
  { title: "International Confederation of Midwives", url: "https://internationalmidwives.org/", description: "Understanding midwifery care, preparation, informed choices and evidence supporting natural birth." },
  { title: "DHS Program", url: "https://dhsprogram.com/data/", description: "Population survey data; identify period, population and definitions, not an individual woman's medical risk." },
  { title: "Data for India — maternal health", url: "https://www.dataforindia.com/topic/maternal-health/", description: "Indian maternal-health patterns; check underlying official data and state its period and definitions." },
  { title: "UNICEF India", url: "https://www.unicef.org/india/maternal-health-0", description: "Indian maternal-health context and population patterns; do not use these to assess individual risk." },
  { title: "Data for India — maternal mortality", url: "https://www.dataforindia.com/maternal-mortality/", description: "Maternal-mortality data and definitions; distinguish population patterns from individual medical assessment." },
  { title: "NICE", url: "https://www.nice.org.uk/guidance", description: "UK guidance: identify it as UK guidance and explain relevant differences from Indian guidance." },
  { title: "Times of India", url: "https://timesofindia.indiatimes.com/", description: "Current news and context, not clinical guidance; verify medical claims against original research or guidance." },
  { title: "The Hindu", url: "https://www.thehindu.com/", description: "Current news and context, not clinical guidance; distinguish reporting and opinion from medical evidence." },
  { title: "The Indian Express", url: "https://indianexpress.com/", description: "Current news and context, not clinical guidance; check medical claims against original evidence." },
  { title: "RIVM", url: "https://www.rivm.nl/", description: "Netherlands maternity-care information and care arrangements; do not assume the same model applies in India." },
  { title: "Perined", url: "https://www.perined.nl/", description: "Netherlands birth outcomes and care reviews; compare similar populations and definitions." },
  { title: "Helsenorge", url: "https://www.helsenorge.no/", description: "Norwegian public-health information, including local maternity-care arrangements." },
  { title: "Norwegian Directorate of Health", url: "https://www.helsedirektoratet.no/", description: "Norwegian national guidance; identify its country and relevant care-system differences." },
  { title: "1177", url: "https://www.1177.se/", description: "Swedish public-health information and local care pathways; identify its country context." },
  { title: "Danish Health Authority", url: "https://www.sst.dk/", description: "Danish maternity-care guidance; explain relevant differences in local care arrangements." },
  { title: "Health New Zealand", url: "https://www.healthnz.govt.nz/", description: "New Zealand maternity-care arrangements, guidance and outcome data; comparisons need matching populations and definitions." },
];

export const approvedSearchDomains = [...new Set(referenceSources
  .filter(source => source.title !== "Evidence Based Birth")
  .map(source => new URL(source.url).hostname.replace(/^www\./, "")))];
