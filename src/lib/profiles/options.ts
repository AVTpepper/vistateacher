export const professionalRoles = [
  "Classroom teacher",
  "Subject specialist",
  "Special education teacher",
  "Teaching assistant",
  "Department or subject lead",
  "Grade or year-level lead",
  "Teacher lead",
  "Instructional coach",
  "Principal or headteacher",
  "Assistant or deputy principal",
  "School leadership",
  "District or network leadership",
  "Counselor or student support",
  "Librarian or resource specialist",
  "Teacher educator",
  "Student teacher",
  "Other education professional",
] as const;

export const educationStages = [
  {
    value: "Early Childhood",
    label: "Early Childhood",
    guidance: "Pre-K to Kindergarten",
  },
  {
    value: "Primary / Elementary School",
    label: "Primary / Elementary School",
    guidance: "typically Grades 1-6",
  },
  {
    value: "Lower Secondary / Middle School",
    label: "Lower Secondary / Middle School",
    guidance: "typically Grades 7-10",
  },
  {
    value: "Upper Secondary / High School",
    label: "Upper Secondary / High School",
    guidance: "typically Grades 11-13",
  },
  {
    value: "Vocational / Technical Education",
    label: "Vocational / Technical Education",
    guidance: "career and trade programs",
  },
  {
    value: "College / University",
    label: "College / University",
    guidance: "higher education",
  },
  {
    value: "Adult / Continuing Education",
    label: "Adult / Continuing Education",
    guidance: "adult learners",
  },
  {
    value: "Multiple Education Levels",
    label: "Multiple Education Levels",
    guidance: "works across stages",
  },
  { value: "Other", label: "Other", guidance: "another education setting" },
] as const;

export const subjectAreas = [
  "Primary / General Education",
  "Arts",
  "Early Childhood",
  "English Language Arts",
  "Languages",
  "Mathematics",
  "Physical Education",
  "Science",
  "Social Studies",
  "Special Education",
  "Technology",
  "Career and Vocational Education",
  "School Leadership",
  "Curriculum and Assessment",
  "Student Wellbeing",
  "Other",
] as const;

export const taughtLanguages = [
  "Arabic",
  "Chinese",
  "English",
  "French",
  "German",
  "Italian",
  "Japanese",
  "Norwegian",
  "Spanish",
  "Sign Language",
  "Other",
] as const;

export const educationStageValues = educationStages.map(
  ({ value }) => value,
) as [string, ...string[]];
