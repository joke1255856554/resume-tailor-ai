export type ChineseResumeIcon =
  | 'phone' | 'email' | 'location'
  | 'education' | 'experience' | 'projects' | 'campus' | 'awards' | 'skills'

export const CHINESE_RESUME_ICON_PATHS: Record<ChineseResumeIcon, string[]> = {
  phone: ['M6.6 3.8 9 3.2l2 4.7-1.8 1.4c1.1 2.4 3.1 4.4 5.5 5.5l1.4-1.8 4.7 2-.6 2.4c-.3 1.2-1.4 2-2.7 1.8C10.8 18.2 5.8 13.2 4.8 6.5c-.2-1.3.6-2.4 1.8-2.7Z'],
  email: ['M3.5 6.5h17v11h-17z', 'm4 7 8 6 8-6'],
  location: ['M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z', 'M12 12.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z'],
  education: ['M3 8.5 12 4l9 4.5-9 4.5z', 'M6.5 10.5v5.2c2.9 2.1 8.1 2.1 11 0v-5.2', 'M21 9v6'],
  experience: ['M4 7h16v12H4z', 'M8 7V4h8v3', 'M4 11h16', 'M10 11v2h4v-2'],
  projects: ['M4 5h6l2 2h8v12H4z', 'M8 11h8', 'M8 15h6'],
  campus: ['M4 19V9l8-5 8 5v10', 'M8 19v-6h8v6', 'M2 19h20'],
  awards: ['M8 4h8v5a4 4 0 0 1-8 0z', 'M8 6H4v2a4 4 0 0 0 4 4', 'M16 6h4v2a4 4 0 0 1-4 4', 'M12 13v4', 'M8 20h8', 'M10 17h4'],
  skills: ['M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3', 'm5.6 5.6 2.1 2.1', 'm16.3 16.3 2.1 2.1', 'm18.4 5.6-2.1 2.1', 'm7.7 16.3-2.1 2.1', 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z'],
}
