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
    },

    // ============ DOCX EXPORT (Native Word Document) ============
    /**
     * Generate native DOCX binary using docx library format
     * Creates ATS-friendly Word document with proper styling
     * @param {Object} cv - Injected CV JSON
     * @returns {Promise<Blob>} DOCX file as Blob
     */
    async exportToDocx(cv) {
      console.log('[CVInjector] 📄 Generating native DOCX');
      const startTime = performance.now();

      // Build XML content for DOCX
      const docxContent = this._buildDocxXML(cv);
      
      // Create DOCX archive structure
      const docxBlob = await this._createDocxBlob(docxContent);
      
      console.log(`[CVInjector] ✅ DOCX generated in ${(performance.now() - startTime).toFixed(0)}ms`);
      return docxBlob;
    },

    /**
     * Build Word XML document content
     * @param {Object} cv - CV JSON object
     * @returns {Object} XML content parts
     */
    _buildDocxXML(cv) {
      const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
      
      // Document.xml - Main content
      const documentXml = `${xmlHeader}
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${this._buildDocxHeader(cv)}
    ${this._buildDocxSummary(cv)}
    ${this._buildDocxExperience(cv)}
    ${this._buildDocxSkills(cv)}
    ${this._buildDocxEducation(cv)}
    ${this._buildDocxCertifications(cv)}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

      // Styles.xml - ATS-friendly Calibri 11pt
      const stylesXml = `${xmlHeader}
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="120" w:line="240" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:pPr><w:spacing w:before="240" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:pPr><w:spacing w:before="200" w:after="40"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr>
  </w:style>
</w:styles>`;

      // [Content_Types].xml
      const contentTypesXml = `${xmlHeader}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

      // _rels/.rels
      const relsXml = `${xmlHeader}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

      // word/_rels/document.xml.rels
      const documentRelsXml = `${xmlHeader}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

      return {
        '[Content_Types].xml': contentTypesXml,
        '_rels/.rels': relsXml,
        'word/document.xml': documentXml,
        'word/styles.xml': stylesXml,
        'word/_rels/document.xml.rels': documentRelsXml
      };
    },

    /**
     * Escape XML special characters
     */
    _escapeXml(text) {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    },

    /**
     * Build DOCX header section (name + contact)
     */
    _buildDocxHeader(cv) {
      const name = this._escapeXml(cv.personal.name);
      const contact = [cv.personal.location, cv.personal.email, cv.personal.phone]
        .filter(Boolean).map(s => this._escapeXml(s)).join(' | ');
      const links = [cv.personal.linkedin, cv.personal.github]
        .filter(Boolean).map(s => this._escapeXml(s)).join(' | ');

      return `
    <w:p>
      <w:pPr><w:pStyle w:val="Title"/><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${name}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>${contact}</w:t></w:r>
    </w:p>
    ${links ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${links}</w:t></w:r></w:p>` : ''}`;
    },

    /**
     * Build DOCX summary section
     */
    _buildDocxSummary(cv) {
      if (!cv.summary) return '';
      return `
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>PROFESSIONAL SUMMARY</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>${this._escapeXml(cv.summary)}</w:t></w:r>
    </w:p>`;
    },

    /**
     * Build DOCX experience section
     */
    _buildDocxExperience(cv) {
      if (!cv.experience.length) return '';
      
      let xml = `
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>EXPERIENCE</w:t></w:r>
    </w:p>`;

      cv.experience.forEach(exp => {
        const titleLine = `${this._escapeXml(exp.company)} | ${this._escapeXml(exp.title)}`;
        xml += `
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>${titleLine}</w:t></w:r>
    </w:p>`;
        
        if (exp.dates) {
          xml += `
    <w:p>
      <w:r><w:rPr><w:i/></w:rPr><w:t>${this._escapeXml(exp.dates)}</w:t></w:r>
    </w:p>`;
        }

        exp.bullets.slice(0, 6).forEach(bullet => {
          xml += `
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>• ${this._escapeXml(bullet)}</w:t></w:r>
    </w:p>`;
        });
      });

      return xml;
    },

    /**
     * Build DOCX skills section (comma-separated, ATS-friendly)
     */
    _buildDocxSkills(cv) {
      if (!cv.skills.hard.length) return '';
      const skills = cv.skills.hard.map(s => this._escapeXml(s)).join(', ');
      return `
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>SKILLS</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>${skills}</w:t></w:r>
    </w:p>`;
    },

    /**
     * Build DOCX education section
     */
    _buildDocxEducation(cv) {
      if (!cv.education.length) return '';
      let xml = `
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>EDUCATION</w:t></w:r>
    </w:p>`;
      
      cv.education.forEach(edu => {
        xml += `
    <w:p>
      <w:r><w:t>${this._escapeXml(edu.degree)}</w:t></w:r>
    </w:p>`;
      });
      
      return xml;
    },

    /**
     * Build DOCX certifications section
     */
    _buildDocxCertifications(cv) {
      if (!cv.certifications.length) return '';
      const certs = cv.certifications.map(c => this._escapeXml(c)).join(', ');
      return `
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>CERTIFICATIONS</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>${certs}</w:t></w:r>
    </w:p>`;
    },

    /**
     * Create DOCX ZIP archive as Blob
     * @param {Object} files - XML content files
     * @returns {Promise<Blob>} DOCX Blob
     */
    async _createDocxBlob(files) {
      // Use JSZip if available, otherwise minimal ZIP implementation
      if (typeof JSZip !== 'undefined') {
        const zip = new JSZip();
        for (const [path, content] of Object.entries(files)) {
          zip.file(path, content);
        }
        return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      }

      // Minimal ZIP implementation for Chrome extension
      return this._createMinimalZip(files);
    },

    /**
     * Minimal ZIP implementation without external dependencies
     * Creates valid DOCX/Office Open XML package
     */
    _createMinimalZip(files) {
      const textEncoder = new TextEncoder();
      const entries = [];
      let offset = 0;

      // Build local file headers and data
      for (const [path, content] of Object.entries(files)) {
        const pathBytes = textEncoder.encode(path);
        const contentBytes = textEncoder.encode(content);
        
        // Local file header (30 bytes + path + content)
        const localHeader = new Uint8Array(30 + pathBytes.length);
        const view = new DataView(localHeader.buffer);
        
        view.setUint32(0, 0x04034b50, true); // Local file signature
        view.setUint16(4, 20, true); // Version needed
        view.setUint16(6, 0, true); // General purpose flag
        view.setUint16(8, 0, true); // Compression method (stored)
        view.setUint16(10, 0, true); // Mod time
        view.setUint16(12, 0, true); // Mod date
        view.setUint32(14, this._crc32(contentBytes), true); // CRC-32
        view.setUint32(18, contentBytes.length, true); // Compressed size
        view.setUint32(22, contentBytes.length, true); // Uncompressed size
        view.setUint16(26, pathBytes.length, true); // File name length
        view.setUint16(28, 0, true); // Extra field length
        localHeader.set(pathBytes, 30);

        entries.push({
          path,
          pathBytes,
          contentBytes,
          localHeader,
          offset,
          crc: this._crc32(contentBytes)
        });

        offset += localHeader.length + contentBytes.length;
      }

      // Build central directory
      const centralDir = [];
      for (const entry of entries) {
        const header = new Uint8Array(46 + entry.pathBytes.length);
        const view = new DataView(header.buffer);
        
        view.setUint32(0, 0x02014b50, true); // Central directory signature
        view.setUint16(4, 20, true); // Version made by
        view.setUint16(6, 20, true); // Version needed
        view.setUint16(8, 0, true); // General purpose flag
        view.setUint16(10, 0, true); // Compression method
        view.setUint16(12, 0, true); // Mod time
        view.setUint16(14, 0, true); // Mod date
        view.setUint32(16, entry.crc, true); // CRC-32
        view.setUint32(20, entry.contentBytes.length, true); // Compressed size
        view.setUint32(24, entry.contentBytes.length, true); // Uncompressed size
        view.setUint16(28, entry.pathBytes.length, true); // File name length
        view.setUint16(30, 0, true); // Extra field length
        view.setUint16(32, 0, true); // Comment length
        view.setUint16(34, 0, true); // Disk number start
        view.setUint16(36, 0, true); // Internal file attributes
        view.setUint32(38, 0, true); // External file attributes
        view.setUint32(42, entry.offset, true); // Relative offset
        header.set(entry.pathBytes, 46);
        
        centralDir.push(header);
      }

      // End of central directory
      const centralDirSize = centralDir.reduce((sum, h) => sum + h.length, 0);
      const eocd = new Uint8Array(22);
      const eocdView = new DataView(eocd.buffer);
      
      eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
      eocdView.setUint16(4, 0, true); // Disk number
      eocdView.setUint16(6, 0, true); // Disk with central directory
      eocdView.setUint16(8, entries.length, true); // Entries on this disk
      eocdView.setUint16(10, entries.length, true); // Total entries
      eocdView.setUint32(12, centralDirSize, true); // Central directory size
      eocdView.setUint32(16, offset, true); // Central directory offset
      eocdView.setUint16(20, 0, true); // Comment length

      // Combine all parts
      const totalSize = offset + centralDirSize + 22;
      const zipBuffer = new Uint8Array(totalSize);
      let pos = 0;

      for (const entry of entries) {
        zipBuffer.set(entry.localHeader, pos);
        pos += entry.localHeader.length;
        zipBuffer.set(entry.contentBytes, pos);
        pos += entry.contentBytes.length;
      }

      for (const header of centralDir) {
        zipBuffer.set(header, pos);
        pos += header.length;
      }

      zipBuffer.set(eocd, pos);

      return new Blob([zipBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
    },

    /**
     * CRC-32 implementation for ZIP
     */
    _crc32(data) {
      const table = this._crc32Table || (this._crc32Table = this._makeCRC32Table());
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    },

    _makeCRC32Table() {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
      }
      return table;
    },

    // ============ PDF EXPORT (Canvas-based) ============
    /**
     * Generate ATS-friendly PDF using canvas
     * @param {Object} cv - Injected CV JSON
     * @returns {Promise<Blob>} PDF file as Blob
     */
    async exportToPDF(cv) {
      console.log('[CVInjector] 📄 Generating native PDF');
      const startTime = performance.now();

      // Use jsPDF if available, otherwise fallback to text/PDF hybrid
      if (typeof jspdf !== 'undefined' || typeof jsPDF !== 'undefined') {
        return this._exportWithJsPDF(cv);
      }

      // Canvas-based PDF generation
      const pdfContent = this._buildPDFContent(cv);
      console.log(`[CVInjector] ✅ PDF generated in ${(performance.now() - startTime).toFixed(0)}ms`);
      return pdfContent;
    },

    /**
     * Build PDF content using minimal PDF structure
     * @param {Object} cv - CV JSON object
     * @returns {Blob} PDF Blob
     */
    _buildPDFContent(cv) {
      const lines = [];
      let y = 750; // Start from top
      const lineHeight = 14;
      const margin = 72; // 1 inch margin
      
      // Build text content
      const textContent = [];
      
      // Header
      textContent.push({ text: cv.personal.name.toUpperCase(), size: 18, bold: true, y: y, center: true });
      y -= 24;
      
      const contact = [cv.personal.location, cv.personal.email, cv.personal.phone].filter(Boolean).join(' | ');
      textContent.push({ text: contact, size: 10, y: y, center: true });
      y -= 16;
      
      const links = [cv.personal.linkedin, cv.personal.github].filter(Boolean).join(' | ');
      if (links) {
        textContent.push({ text: links, size: 10, y: y, center: true });
        y -= 24;
      }

      // Summary
      if (cv.summary) {
        y -= 12;
        textContent.push({ text: 'PROFESSIONAL SUMMARY', size: 12, bold: true, y: y });
        y -= 16;
        textContent.push({ text: cv.summary, size: 10, y: y, wrap: true });
        y -= Math.ceil(cv.summary.length / 80) * lineHeight + 12;
      }

      // Experience
      if (cv.experience.length) {
        textContent.push({ text: 'EXPERIENCE', size: 12, bold: true, y: y });
        y -= 18;
        
        cv.experience.forEach(exp => {
          textContent.push({ text: `${exp.company} | ${exp.title}`, size: 11, bold: true, y: y });
          y -= 14;
          if (exp.dates) {
            textContent.push({ text: exp.dates, size: 10, italic: true, y: y });
            y -= 14;
          }
          exp.bullets.slice(0, 6).forEach(bullet => {
            textContent.push({ text: `• ${bullet}`, size: 10, y: y, indent: 10 });
            y -= Math.ceil(bullet.length / 85) * lineHeight;
          });
          y -= 8;
        });
      }

      // Skills
      if (cv.skills.hard.length) {
        y -= 8;
        textContent.push({ text: 'SKILLS', size: 12, bold: true, y: y });
        y -= 16;
        textContent.push({ text: cv.skills.hard.join(', '), size: 10, y: y, wrap: true });
        y -= 20;
      }

      // Education
      if (cv.education.length) {
        textContent.push({ text: 'EDUCATION', size: 12, bold: true, y: y });
        y -= 16;
        cv.education.forEach(edu => {
          textContent.push({ text: edu.degree, size: 10, y: y });
          y -= 14;
        });
      }

      // Build PDF binary
      return this._createPDFBlob(textContent);
    },

    /**
     * Create minimal valid PDF Blob
     */
    _createPDFBlob(textContent) {
      // Build PDF text stream
      let textStream = '';
      textContent.forEach(item => {
        const x = item.center ? 306 : (72 + (item.indent || 0));
        const size = item.size || 11;
        const font = item.bold ? '/F2' : '/F1';
        
        // Escape special PDF characters
        const escapedText = (item.text || '')
          .replace(/\\/g, '\\\\')
          .replace(/\(/g, '\\(')
          .replace(/\)/g, '\\)')
          .replace(/[\x00-\x1f]/g, '');
        
        textStream += `BT ${font} ${size} Tf ${x} ${item.y} Td (${escapedText}) Tj ET\n`;
      });

      const streamLength = textStream.length;

      const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${textStream}endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
6 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000${(streamLength + 320).toString().padStart(3, '0')} 00000 n 
0000000${(streamLength + 390).toString().padStart(3, '0')} 00000 n 
trailer
<< /Size 7 /Root 1 0 R >>
startxref
${streamLength + 460}
%%EOF`;

      return new Blob([pdf], { type: 'application/pdf' });
    },

    // ============ DOWNLOAD HELPER ============
    /**
     * Trigger file download
     * @param {Blob} blob - File blob
     * @param {string} filename - Download filename
     */
    downloadFile(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`[CVInjector] ⬇️ Downloaded: ${filename}`);
    },

    // ============ EXPORT ALL FORMATS ============
    /**
     * Export CV to all formats (DOCX, PDF, TXT)
     * @param {Object} cv - Injected CV JSON
     * @param {string} baseName - Base filename (e.g., "John_Doe_CV")
     * @returns {Promise<Object>} Export results
     */
    async exportAllFormats(cv, baseName = 'ATS_CV') {
      console.log('[CVInjector] 📦 Exporting all formats');
      const results = { success: true, files: [] };

      try {
        // DOCX
        const docxBlob = await this.exportToDocx(cv);
        results.files.push({ format: 'docx', blob: docxBlob, filename: `${baseName}.docx` });

        // PDF
        const pdfBlob = await this.exportToPDF(cv);
        results.files.push({ format: 'pdf', blob: pdfBlob, filename: `${baseName}.pdf` });

        // TXT
        const txtContent = this.exportToDocxText(cv);
        const txtBlob = new Blob([txtContent], { type: 'text/plain' });
        results.files.push({ format: 'txt', blob: txtBlob, filename: `${baseName}.txt` });

        console.log(`[CVInjector] ✅ All formats exported: ${results.files.map(f => f.format).join(', ')}`);
      } catch (error) {
        console.error('[CVInjector] Export error:', error);
        results.success = false;
        results.error = error.message;
      }

      return results;
    }
  };

  // ============ EXPORT ============
  global.CVInjector = CVInjector;

})(typeof window !== 'undefined' ? window : global);
