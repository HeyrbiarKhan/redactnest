/**
 * The licence notice's words, in one place. Spec 0009, AC-1 and AC-3.
 *
 * AGPL section 5(d) asks a program with an interactive interface to show four
 * things: a copyright notice, that there is no warranty, that people may share
 * the work under the licence, and how to read the licence. Section 13 adds an
 * offer of the source to everyone who uses it over a network. The footer shows
 * each of these from here, never from a literal in a component. The wording,
 * without the word "free", was settled in spec 0009's design.
 */

const holder = "Heyrbiar Khan";

/** The year of first publication. */
const year = 2026;

export const LEGAL = Object.freeze({
  holder,
  year,
  copyrightLine: `© ${year} ${holder}`,
  licenceLine:
    "Licensed under the GNU AGPL 3.0 or later, which lets you share and change it",
  warrantyLine: "No warranty",
  sourceLabel: "Source code for this version",
  licenceLabel: "Licence",
  noticesLabel: "Third party notices",
  /** AC-3: a development build has no commit to link to. */
  sourcePending: "Source code for this version (link set per deploy)",
});
