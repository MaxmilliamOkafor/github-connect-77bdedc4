// cv-injector-engine.js - Python-Inspired ATS CV Injector v1.0
// Translates Python cv_injector.py logic to JavaScript for Chrome Extension
// Features: JSON CV structure, Priority-based keyword injection, Multi-format export
// Tested for: Workday, Greenhouse, iCIMS, SmartRecruiters, Oracle, Teamtailor

(function(global) {
  'use strict';

  const CVInjector = {
    // ============ CONFIGURATION ============
    CONFIG: {
      MAX_HIGH_PRIO_SKILLS: 5,        // Max high-priority keywords in skills
      MAX_KEYWORDS_PER_BULLET: 3,      // 3-5 mentions max per high-priority term
      MAX_TOTAL_INJECTIONS: 15,        // Prevents keyword stuffing
      ROTATION_ENABLED: true           // Rotate keywords naturally across bullets
    },

    // ============ INJECTION TEMPLATES (Python-style natural phrasing) ============
    INJECTION_TEMPLATES: [
      'Leveraged {kw} to optimize pipelines, achieving {metric}.',
      'Applied {kw} in Agile sprints for scalable ML solutions.',
      'Demonstrated expertise in {kw} across production deployments.',
      'Implemented {kw} strategies driving {metric} improvement.',
      'Built {kw} frameworks enabling cross-functional delivery.',
      'Orchestrated {kw} initiatives reducing operational overhead by {metric}.'
    ],

    // ============ METRIC PLACEHOLDERS ============
    METRIC_TEMPLATES: [
      '20% efficiency gain', '30% cost reduction', '40% faster delivery',
      '25% improvement', '15% productivity boost', '35% optimization',
      '50% time savings', '45% error reduction'
    ],

    // ============ PARSE BASE CV (JSON STRUCTURE) ============
    /**
     * Parse CV text into structured JSON format
     * @param {string} cvText - Raw CV text
     * @returns {Object} Structured CV object
     */
    parseCVToJSON(cvText) {
      if (!cvText) return null;

      const cv = {
        personal: { name: '', location: '', email: '', phone: '', linkedin: '', github: '' },
        summary: '',
        experience: [],
        skills: { hard: [], soft: [] },
        education: [],
        certifications: []
      };

      const lines = cvText.split('\n');
      let currentSection = 'header';
      let currentRole = null;
      let summaryLines = [];

      const sectionPatterns = {
        summary: /^(PROFESSIONAL\s*SUMMARY|SUMMARY|PROFILE|OBJECTIVE)[\s:]*$/i,
        experience: /^(EXPERIENCE|WORK\s*EXPERIENCE|EMPLOYMENT|PROFESSIONAL\s*EXPERIENCE)[\s:]*$/i,
        skills: /^(SKILLS|TECHNICAL\s*SKILLS|CORE\s*SKILLS|KEY\s*SKILLS)[\s:]*$/i,
        education: /^(EDUCATION|ACADEMIC|QUALIFICATIONS)[\s:]*$/i,
        certifications: /^(CERTIFICATIONS?|LICENSES?|CREDENTIALS?)[\s:]*$/i
      };

      // Parse header (first few lines)
      const headerLines = lines.slice(0, 10);
      for (const line of headerLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Name detection (first substantial line, usually uppercase or title case)
        if (!cv.personal.name && trimmed.length > 3 && /^[A-Z]/.test(trimmed) && !/[@|•]/.test(trimmed)) {
          cv.personal.name = trimmed;
        }
        // Email
        const emailMatch = trimmed.match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) cv.personal.email = emailMatch[0];
        // Phone
        const phoneMatch = trimmed.match(/[\+]?[\d\s\-\(\)]{10,}/);
        if (phoneMatch) cv.personal.phone = phoneMatch[0].trim();
        // LinkedIn
        const linkedinMatch = trimmed.match(/linkedin\.com\/in\/[\w-]+/i);
        if (linkedinMatch) cv.personal.linkedin = linkedinMatch[0];
        // GitHub
        const githubMatch = trimmed.match(/github\.com\/[\w-]+/i);
        if (githubMatch) cv.personal.github = githubMatch[0];
        // Location (contains city/country patterns)
        if (/,\s*[A-Z]{2,}\s*$|,\s*\w+\s*,\s*\w+|Dublin|London|New York|San Francisco/i.test(trimmed)) {
          cv.personal.location = trimmed.replace(/[|•]/g, '').trim();
        }
      }

      // Parse sections
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Check for section headers
        for (const [section, pattern] of Object.entries(sectionPatterns)) {
          if (pattern.test(trimmed)) {
            // Save previous section content
            if (currentSection === 'summary' && summaryLines.length) {
              cv.summary = summaryLines.join(' ').trim();
            }
            if (currentSection === 'experience' && currentRole) {
              cv.experience.push(currentRole);
              currentRole = null;
            }
            currentSection = section;
            summaryLines = [];
            continue;
          }
        }

        // Parse content based on current section
        if (currentSection === 'summary' && trimmed) {
          summaryLines.push(trimmed);
        }

        if (currentSection === 'experience' && trimmed) {
          // Detect role header (Company | Title | Date pattern)
          const roleMatch = trimmed.match(/^(.+?)\s*[|–-]\s*(.+?)(?:\s*[|–-]\s*(.+))?$/);
          const isBullet = /^[•\-\*▪▸►]\s/.test(trimmed);
          const isDate = /\d{4}\s*[-–]\s*(Present|\d{4})/i.test(trimmed);

          if (!isBullet && (roleMatch || isDate)) {
            // Save previous role
            if (currentRole) cv.experience.push(currentRole);
            
            currentRole = {
              title: roleMatch?.[2] || '',
              company: roleMatch?.[1] || trimmed.split('|')[0]?.trim() || '',
              dates: roleMatch?.[3] || trimmed.match(/\d{4}\s*[-–]\s*(Present|\d{4})/i)?.[0] || '',
              bullets: []
            };
          } else if (isBullet && currentRole) {
            currentRole.bullets.push(trimmed.replace(/^[•\-\*▪▸►]\s*/, ''));
          }
        }

        if (currentSection === 'skills' && trimmed) {
          // Parse comma-separated or bullet skills
          const skills = trimmed
            .replace(/^[•\-\*]\s*/, '')
            .split(/[,;]/)
            .map(s => s.trim())
            .filter(s => s.length >= 2 && s.length <= 40);
          cv.skills.hard.push(...skills);
        }

        if (currentSection === 'education' && trimmed) {
          if (trimmed.length > 5 && !sectionPatterns.education.test(trimmed)) {
            cv.education.push({ degree: trimmed, school: '', dates: '' });
          }
        }

        if (currentSection === 'certifications' && trimmed) {
          if (!sectionPatterns.certifications.test(trimmed)) {
            cv.certifications.push(trimmed.replace(/^[•\-\*]\s*/, ''));
          }
        }
      }

      // Save last role
      if (currentRole) cv.experience.push(currentRole);
      if (summaryLines.length) cv.summary = summaryLines.join(' ').trim();

      // Dedupe skills
      cv.skills.hard = [...new Set(cv.skills.hard)];

      console.log('[CVInjector] Parsed CV JSON:', {
        name: cv.personal.name,
        roles: cv.experience.length,
        skills: cv.skills.hard.length
      });

      return cv;
    },

    // ============ PARSE KEYWORDS JSON ============
    /**
     * Parse keywords from UniversalKeywordStrategy format to injector format
     * @param {Object} keywords - Keywords object from strategy
     * @returns {Array} Keywords array with priority and targets
     */
    parseKeywordsToJSON(keywords) {
      const result = [];

      // High priority → experience + skills
      (keywords.highROI || keywords.highPriority || []).forEach(kw => {
        result.push({ keyword: kw, priority: 'high', targets: ['experience', 'skills'] });
      });

      // Medium priority → experience only
      (keywords.mediumROI || keywords.mediumPriority || []).forEach(kw => {
        result.push({ keyword: kw, priority: 'medium', targets: ['experience'] });
      });

      // Low priority → summary or light mention
      (keywords.lowROI || keywords.lowPriority || []).forEach(kw => {
        result.push({ keyword: kw, priority: 'low', targets: ['summary'] });
      });

      // Unclassified → experience
      (keywords.unclassified || []).forEach(kw => {
        result.push({ keyword: kw, priority: 'medium', targets: ['experience'] });
      });

      return result;
    },

    // ============ INJECT KEYWORDS (CORE PYTHON LOGIC) ============
    /**
     * Inject keywords naturally into CV structure
     * @param {Object} cv - Parsed CV JSON
     * @param {Array} keywords - Keywords array with priority
     * @param {Object} options - Injection options
     * @returns {Object} Injected CV with stats
     */
    injectKeywords(cv, keywords, options = {}) {
      const startTime = performance.now();
      const stats = {
        skillsAdded: 0,
        bulletsModified: 0,
        newBulletsCreated: 0,
        totalInjections: 0,
        keywordsCovered: []
      };

      const locationOverride = options.locationOverride || null;
      const injectedCV = JSON.parse(JSON.stringify(cv)); // Deep clone

      // Group by priority
      const highPrio = keywords.filter(k => k.priority === 'high');
      const medPrio = keywords.filter(k => k.priority === 'medium');

      // ============ SKILLS INJECTION ============
      // Add 3-5 high-priority keywords to skills (no stuffing)
      const skillsToAdd = highPrio
        .filter(k => k.targets.includes('skills'))
        .slice(0, this.CONFIG.MAX_HIGH_PRIO_SKILLS);

      skillsToAdd.forEach(k => {
        if (!injectedCV.skills.hard.some(s => s.toLowerCase() === k.keyword.toLowerCase())) {
          injectedCV.skills.hard.push(k.keyword);
          stats.skillsAdded++;
          stats.keywordsCovered.push(k.keyword);
        }
      });

      // Dedupe skills
      injectedCV.skills.hard = [...new Set(injectedCV.skills.hard)];

      // ============ EXPERIENCE INJECTION ============
      // Rotate 3-5 mentions across bullets (natural phrasing)
      const experienceKeywords = [...highPrio.slice(0, 3), ...medPrio.slice(0, 2)]
        .filter(k => k.targets.includes('experience'));

      let templateIdx = 0;
      const usedKeywords = new Set();

      injectedCV.experience.forEach((exp, expIdx) => {
        exp.bullets = exp.bullets.map((bullet, bulletIdx) => {
          // Only inject if we haven't hit max and keyword not already in bullet
          if (stats.totalInjections >= this.CONFIG.MAX_TOTAL_INJECTIONS) return bullet;

          const bulletLower = bullet.toLowerCase();
          const kw = experienceKeywords.find(k => 
            !usedKeywords.has(k.keyword.toLowerCase()) && 
            !bulletLower.includes(k.keyword.toLowerCase())
          );

          if (!kw) return bullet;

          // Get random metric
          const metric = this.METRIC_TEMPLATES[Math.floor(Math.random() * this.METRIC_TEMPLATES.length)];

          // Apply injection template
          const template = this.INJECTION_TEMPLATES[templateIdx % this.INJECTION_TEMPLATES.length];
          const injectedPhrase = template.replace('{kw}', kw.keyword).replace('{metric}', metric);
          templateIdx++;

          // Enhance bullet naturally
          let enhanced;
          if (bullet.endsWith('.')) {
            // Insert before final period with connector
            enhanced = bullet.slice(0, -1) + `, ${injectedPhrase.toLowerCase().replace(/\.$/, '')}.`;
          } else {
            enhanced = bullet + ` ${injectedPhrase}`;
          }

          usedKeywords.add(kw.keyword.toLowerCase());
          stats.bulletsModified++;
          stats.totalInjections++;
          stats.keywordsCovered.push(kw.keyword);

          return enhanced;
        });

        // Create new bullet if significant keywords still missing (one per role max)
        const remainingHigh = highPrio.filter(k => 
          k.targets.includes('experience') && 
          !usedKeywords.has(k.keyword.toLowerCase())
        );

        if (remainingHigh.length >= 2 && expIdx === 0 && stats.newBulletsCreated < 2) {
          const kws = remainingHigh.slice(0, 2);
          const metric = this.METRIC_TEMPLATES[Math.floor(Math.random() * this.METRIC_TEMPLATES.length)];
          const newBullet = `Implemented ${kws.map(k => k.keyword).join(' and ')} solutions, achieving ${metric}`;
          
          exp.bullets.push(newBullet);
          kws.forEach(k => {
            usedKeywords.add(k.keyword.toLowerCase());
            stats.keywordsCovered.push(k.keyword);
          });
          stats.newBulletsCreated++;
          stats.totalInjections += 2;
        }
      });

      // ============ LOCATION TAILORING ============
      if (locationOverride) {
        injectedCV.personal.location = locationOverride;
      }

      stats.timing = performance.now() - startTime;
      console.log('[CVInjector] Injection complete:', stats);

      return { cv: injectedCV, stats };
    },

    // ============ EXPORT TO DOCX TEXT ============
    /**
     * Export CV to ATS-friendly text format (DOCX-style)
     * @param {Object} cv - Injected CV JSON
     * @returns {string} Formatted text
     */
    exportToDocxText(cv) {
      const lines = [];

      // Header
      lines.push(cv.personal.name.toUpperCase());
      const contactParts = [cv.personal.location, cv.personal.email, cv.personal.phone].filter(Boolean);
      lines.push(contactParts.join(' | '));
      if (cv.personal.linkedin || cv.personal.github) {
        lines.push([cv.personal.linkedin, cv.personal.github].filter(Boolean).join(' | '));
      }
      lines.push('');

      // Summary
      if (cv.summary) {
        lines.push('PROFESSIONAL SUMMARY');
        lines.push(cv.summary);
        lines.push('');
      }

      // Experience
      if (cv.experience.length) {
        lines.push('EXPERIENCE');
        cv.experience.forEach(exp => {
          lines.push(`${exp.company} | ${exp.title}`);
          if (exp.dates) lines.push(exp.dates);
          exp.bullets.slice(0, 6).forEach(bullet => {
            lines.push(`• ${bullet}`);
          });
          lines.push('');
        });
      }

      // Skills (comma-separated, no bullets)
      if (cv.skills.hard.length) {
        lines.push('SKILLS');
        lines.push(cv.skills.hard.join(', '));
        lines.push('');
      }

      // Education
      if (cv.education.length) {
        lines.push('EDUCATION');
        cv.education.forEach(edu => {
          lines.push(edu.degree);
        });
        lines.push('');
      }

      // Certifications
      if (cv.certifications.length) {
        lines.push('CERTIFICATIONS');
        lines.push(cv.certifications.join(', '));
      }

      return lines.join('\n');
    },

    // ============ EXPORT FOR PDF GENERATOR ============
    /**
     * Export CV sections for PDFATSTurbo generator
     * @param {Object} cv - Injected CV JSON
     * @returns {Object} Sections object for PDF generation
     */
    exportForPDFGenerator(cv) {
      return {
        contact: {
          name: cv.personal.name,
          contactLine: [cv.personal.phone, cv.personal.email, cv.personal.location].filter(Boolean).join(' | '),
          linksLine: [cv.personal.linkedin, cv.personal.github].filter(Boolean).join(' | ')
        },
        summary: cv.summary,
        experience: cv.experience.map(exp => {
          const lines = [`${exp.company} | ${exp.title}`];
          if (exp.dates) lines.push(exp.dates);
          exp.bullets.forEach(b => lines.push(`• ${b}`));
          return lines.join('\n');
        }).join('\n\n'),
        skills: cv.skills.hard.join(', '),
        education: cv.education.map(e => e.degree).join('\n'),
        certifications: cv.certifications.join(', ')
      };
    },

    // ============ FULL INJECTION PIPELINE ============
    /**
     * Complete CV injection pipeline
     * @param {string} cvText - Raw CV text
     * @param {Object} keywords - Keywords from UniversalKeywordStrategy
     * @param {Object} options - Options (locationOverride, etc.)
     * @returns {Object} Result with injected CV in multiple formats
     */
    async fullInjectionPipeline(cvText, keywords, options = {}) {
      const startTime = performance.now();
      console.log('[CVInjector] 🚀 Starting full injection pipeline');

      // Step 1: Parse CV to JSON
      const cvJSON = this.parseCVToJSON(cvText);
      if (!cvJSON) {
        return { success: false, error: 'Failed to parse CV' };
      }

      // Step 2: Parse keywords to JSON format
      const keywordsJSON = this.parseKeywordsToJSON(keywords);

      // Step 3: Inject keywords
      const { cv: injectedCV, stats } = this.injectKeywords(cvJSON, keywordsJSON, options);

      // Step 4: Export to formats
      const docxText = this.exportToDocxText(injectedCV);
      const pdfSections = this.exportForPDFGenerator(injectedCV);

      // Step 5: Calculate match score
      const cvLower = docxText.toLowerCase();
      const allKeywords = keywordsJSON.map(k => k.keyword);
      const matched = allKeywords.filter(kw => cvLower.includes(kw.toLowerCase()));
      const matchScore = allKeywords.length > 0 ? Math.round((matched.length / allKeywords.length) * 100) : 0;

      const timing = performance.now() - startTime;
      console.log(`[CVInjector] ✅ Pipeline complete in ${timing.toFixed(0)}ms | Match: ${matchScore}%`);

      return {
        success: true,
        cvJSON: injectedCV,
        cvText: docxText,
        pdfSections,
        stats,
        matchScore,
        matched,
        missing: allKeywords.filter(kw => !cvLower.includes(kw.toLowerCase())),
        timing,
        // For backward compatibility
        tailoredCV: docxText
      };
    },

    // ============ VALIDATE ATS COMPATIBILITY ============
    /**
     * Validate CV for ATS parsing
     * @param {string} cvText - CV text to validate
     * @returns {Object} Validation result
     */
    validateATSCompatibility(cvText) {
      const checks = {
        noBoldOveruse: true,
        commaSkills: true,
        naturalBullets: true,
        plainTextParseable: true,
        standardSections: true
      };

      // Check for bullet stuffing (bad: "- Python AWS TensorFlow")
      const bulletStuffing = /^[-•\*]\s*([A-Z][a-z]+\s*){4,}$/gm.test(cvText);
      checks.naturalBullets = !bulletStuffing;

      // Check skills are comma-separated (not bulleted list)
      const skillsSection = cvText.match(/SKILLS[\s\S]*?(?=\n(?:EDUCATION|CERTIFICATIONS|$))/i);
      if (skillsSection) {
        const bulletCount = (skillsSection[0].match(/^[-•\*]\s/gm) || []).length;
        checks.commaSkills = bulletCount <= 2; // Allow 1-2 category headers
      }

      // Check for standard sections
      const requiredSections = ['EXPERIENCE', 'SKILLS', 'EDUCATION'];
      checks.standardSections = requiredSections.every(s => 
        new RegExp(s, 'i').test(cvText)
      );

      // Overall validity
      const isValid = Object.values(checks).every(v => v);

      return { isValid, checks };
    }
  };

  // ============ EXPORT ============
  global.CVInjector = CVInjector;

})(typeof window !== 'undefined' ? window : global);
