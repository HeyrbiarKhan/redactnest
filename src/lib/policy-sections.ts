/**
 * Every h2 heading on the two legal pages, word for word, in order. Spec 0011,
 * AC-1 and *Feature design*.
 *
 * The pages read their headings from here and so does the browser test, which
 * walks each list in order, so a heading cannot change on the page without
 * changing here first. Records rather than arrays, so a page names the section
 * it is writing (`PRIVACY_SECTIONS.yourRights`); insertion order is the page's
 * order.
 */

export const PRIVACY_SECTIONS = Object.freeze({
  whoWeAre: "Who we are",
  yourDocuments: "Your documents",
  whatWeReceive: "What we receive when you visit",
  whatWeDoNotDo: "What we do not do",
  services: "Services we use",
  transfers: "Transfers outside the UK and the EU",
  yourRights: "Your rights",
  complaints: "Complaints",
  children: "Children",
  links: "Links to other sites",
  changes: "Changes",
});

export const TERMS_SECTIONS = Object.freeze({
  about: "About these terms",
  whatItDoes: "What RedactNest does",
  checkingTheResult: "Checking the result is your job",
  usingItFairly: "Using it fairly",
  softwareLicence: "The software licence",
  noWarranty: "No warranty",
  liability: "Our liability",
  consumers: "If you are a consumer",
  ending: "Ending",
  lawAndCourts: "Law and courts",
  changes: "Changes",
});
