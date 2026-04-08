const { run, all, get } = require('./utils/db');

class AEOStateMachine {
  static STATES = {
    NOI_SUBMITTED: 'NOI_Submitted',
    SAQ_VALIDATED: 'SAQ_Validated',
    PROVISIONAL: 'Provisional',
    FULL_CERTIFIED: 'Full_Certified'
  };

  static TIERS = {
    AEO_C: 'AEO-C',
    AEO_S: 'AEO-S'
  };

  async transition(applicationId, newState, actorId, evidenceRef = null) {
    const app = await get('SELECT * FROM AEOApplication WHERE ApplicationID = ?', [applicationId]);
    if (!app) throw new Error('Application not found');

    // Validate transition
    const valid = this.isValidTransition(app.Status, newState);
    if (!valid) throw new Error(`Invalid transition from ${app.Status} to ${newState}`);

    // Update state
    await run('UPDATE AEOApplication SET Status = ?, updated_at = CURRENT_TIMESTAMP WHERE ApplicationID = ?', [newState, applicationId]);

    // Trigger remediation if Provisional
    if (newState === 'Provisional') {
      await this.triggerRemediation(applicationId);
    }

    // Log audit
    await run('INSERT INTO AEOAuditLog (ApplicationID, EventType, ActorID, EvidenceRef, Outcome) VALUES (?, ?, ?, ?, ?)', 
      [applicationId, `transition:${newState}`, actorId, evidenceRef, 'PASS']);

    return { success: true, newState };
  }

  isValidTransition(current, next) {
    const transitions = {
      'NOI_Submitted': ['SAQ_Validated'],
      'SAQ_Validated': ['Provisional', 'Full_Certified'],
      'Provisional': ['Full_Certified'],
      'Full_Certified': []
    };
    return transitions[current]?.includes(next) || false;
  }

  async triggerRemediation(applicationId) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 90); // 90 days

    const tracks = ['PhysicalSecurity', 'Documentation', 'FinancialTax'];
    for (const track of tracks) {
      await run('INSERT INTO RemediationTask (TaskID, ApplicationID, Track, Milestone, Deadline, Status) VALUES (?, ?, ?, ?, ?, ?)', 
        [`task_${Date.now()}_${track}`, applicationId, track, 'EvidenceCollection', deadline.toISOString().split('T')[0], 'Pending']);
    }
  }

  async validateEvidence(evidenceId, applicationId) {
    // Deterministic validation logic
    const evidence = await get('SELECT * FROM UploadEvidence WHERE EvidenceID = ? AND ApplicationID = ?', [evidenceId, applicationId]);
    if (!evidence) throw new Error('Evidence not found');

    let validated = false;
    switch (evidence.Type) {
      case 'CCTV':
        validated = this.validateCCTV(evidence.FilePath);
        break;
      case 'SOP':
        validated = this.validateSOP(evidence.FilePath);
        break;
      // Add more validators
    }

    await run('UPDATE UploadEvidence SET Validated = ? WHERE EvidenceID = ?', [validated, evidenceId]);

    // Update tasks
    await this.updateRemediationTasks(applicationId);

    // Audit
    await run('INSERT INTO AEOAuditLog (ApplicationID, EventType, EvidenceRef, Outcome) VALUES (?, ?, ?, ?)', 
      [applicationId, 'evidence_validated', evidenceId, validated ? 'PASS' : 'FAIL']);

    return { validated };
  }

  validateCCTV(filePath) {
    // Deterministic CCTV validation (mock)
    return filePath.includes('cctv') && new Date() - new Date('2024-01-01') < 30*24*60*60*1000; // 30 days
  }

  validateSOP(filePath) {
    // Deterministic SOP validation (mock)
    return filePath.includes('sop') && filePath.includes('signed');
  }

  async updateRemediationTasks(applicationId) {
    const evidences = await all('SELECT * FROM UploadEvidence WHERE ApplicationID = ? AND Validated = true', [applicationId]);
    const tasks = await all('SELECT * FROM RemediationTask WHERE ApplicationID = ?', [applicationId]);

    for (const task of tasks) {
      if (task.Status !== 'Completed') {
        const completed = this.isTaskComplete(task, evidences);
        await run('UPDATE RemediationTask SET Status = ? WHERE TaskID = ?', 
          [completed ? 'Completed' : task.Status, task.TaskID]);
      }
    }
  }

  isTaskComplete(task, evidences) {
    // Deterministic task completion
    const requiredEvidenceCount = task.Track === 'PhysicalSecurity' ? 3 : 2;
    return evidences.filter(e => e.Validated).length >= requiredEvidenceCount;
  }

  async getApplicationStatus(applicationId) {
    const app = await get('SELECT * FROM AEOApplication WHERE ApplicationID = ?', [applicationId]);
    const tasks = await all('SELECT * FROM RemediationTask WHERE ApplicationID = ? ORDER BY Deadline', [applicationId]);
    const evidences = await all('SELECT * FROM UploadEvidence WHERE ApplicationID = ?', [applicationId]);
    const logs = await all('SELECT * FROM AEOAuditLog WHERE ApplicationID = ? ORDER BY Timestamp DESC LIMIT 10', [applicationId]);

    return {
      application: app,
      overdue_tasks: tasks.filter(t => t.Status === 'Overdue' || new Date(t.Deadline) < new Date()),
      pending_tasks: tasks.filter(t => t.Status === 'Pending'),
      evidences,
      recent_audit: logs
    };
  }
}

module.exports = AEOStateMachine;

// Test
if (require.main === module) {
  const machine = new AEOStateMachine();
  console.log('AEO State Machine ready');
}

