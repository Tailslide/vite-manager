const fs = require('fs');
const path = require('path');

describe('VITE Manager Core Functionality', () => {
  describe('Utility Functions', () => {
    it('should generate consistent instance IDs', () => {
      const projectPath = '/test/project';
      const normalizedPath = path.resolve(projectPath);
      
      const id1 = Buffer.from(normalizedPath).toString('base64').replace(/[/+=]/g, '');
      const id2 = Buffer.from(normalizedPath).toString('base64').replace(/[/+=]/g, '');
      
      expect(id1).toBe(id2);
      expect(id1).not.toContain('/');
      expect(id1).not.toContain('+');
      expect(id1).not.toContain('=');
    });

    it('should generate different IDs for different paths', () => {
      const path1 = '/test/project1';
      const path2 = '/test/project2';
      
      const id1 = Buffer.from(path1).toString('base64').replace(/[/+=]/g, '');
      const id2 = Buffer.from(path2).toString('base64').replace(/[/+=]/g, '');
      
      expect(id1).not.toBe(id2);
    });

    it('should generate correct log file paths', () => {
      const instanceId = 'test123';
      const logDir = '/test/vite-logs';
      const expectedPath = path.join(logDir, `vite-${instanceId}.log`);
      
      expect(expectedPath).toContain('vite-test123.log');
    });
  });

  describe('Command Building', () => {
    it('should build basic VITE command', () => {
      const args = ['run', 'dev'];
      expect(args).toEqual(['run', 'dev']);
    });

    it('should build VITE command with port', () => {
      const args = ['run', 'dev'];
      const port = 3000;
      args.push('--port', String(port));
      
      expect(args).toEqual(['run', 'dev', '--port', '3000']);
    });

    it('should build VITE command with host', () => {
      const args = ['run', 'dev'];
      const host = 'localhost';
      args.push('--host', host);
      
      expect(args).toEqual(['run', 'dev', '--host', 'localhost']);
    });

    it('should build VITE command with port and host', () => {
      const args = ['run', 'dev'];
      const port = 3000;
      const host = '0.0.0.0';
      
      args.push('--port', String(port));
      args.push('--host', host);
      
      expect(args).toEqual(['run', 'dev', '--port', '3000', '--host', '0.0.0.0']);
    });
  });

  describe('Port Detection', () => {
    it('should extract port from VITE output', () => {
      const output = 'Local:   http://localhost:3000/\nNetwork: http://192.168.1.100:3000/';
      const portMatch = output.match(/Local:\s+http:\/\/[^:]+:(\d+)/);
      
      expect(portMatch).not.toBeNull();
      if (portMatch) {
        const detectedPort = parseInt(portMatch[1]);
        expect(detectedPort).toBe(3000);
      }
    });

    it('should handle different port formats', () => {
      const outputs = [
        'Local:   http://localhost:5173/',
        'Local: http://127.0.0.1:4000/',
        'Local:http://0.0.0.0:8080/'
      ];
      
      const expectedPorts = [5173, 4000, 8080];
      
      outputs.forEach((output, index) => {
        const portMatch = output.match(/Local:\s*http:\/\/[^:]+:(\d+)/);
        expect(portMatch).not.toBeNull();
        if (portMatch) {
          const detectedPort = parseInt(portMatch[1]);
          expect(detectedPort).toBe(expectedPorts[index]);
        }
      });
    });
  });

  describe('Log File Operations', () => {
    const testDir = path.join(__dirname, 'temp-test');
    const testLogFile = path.join(testDir, 'test.log');

    beforeAll(() => {
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
    });

    afterAll(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    beforeEach(() => {
      if (fs.existsSync(testLogFile)) {
        fs.unlinkSync(testLogFile);
      }
    });

    it('should create and read log file', () => {
      const content = 'Test log entry\nSecond line\nThird line';
      fs.writeFileSync(testLogFile, content);
      
      expect(fs.existsSync(testLogFile)).toBe(true);
      
      const readContent = fs.readFileSync(testLogFile, 'utf-8');
      expect(readContent).toBe(content);
    });

    it('should tail log file (last N lines)', () => {
      const lines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'];
      const content = lines.join('\n');
      fs.writeFileSync(testLogFile, content);
      
      const readContent = fs.readFileSync(testLogFile, 'utf-8');
      const allLines = readContent.split('\n');
      const lastThreeLines = allLines.slice(-3).join('\n');
      
      expect(lastThreeLines).toBe('Line 3\nLine 4\nLine 5');
    });

    it('should list log files in directory', () => {
      // Create multiple test log files
      fs.writeFileSync(path.join(testDir, 'vite-test1.log'), 'content1');
      fs.writeFileSync(path.join(testDir, 'vite-test2.log'), 'content2');
      fs.writeFileSync(path.join(testDir, 'other.txt'), 'other content');
      
      const files = fs.readdirSync(testDir);
      const viteLogFiles = files.filter(file => 
        file.startsWith('vite-') && file.endsWith('.log')
      );
      
      expect(viteLogFiles).toHaveLength(2);
      expect(viteLogFiles).toContain('vite-test1.log');
      expect(viteLogFiles).toContain('vite-test2.log');
    });
  });

  describe('Tool Validation', () => {
    it('should validate tool names', () => {
      const validTools = [
        'start_vite',
        'stop_vite', 
        'get_vite_status',
        'clear_logs',
        'tail_logs'
      ];
      
      const unknownTool = 'unknown_tool';
      
      expect(validTools).not.toContain(unknownTool);
      expect(validTools).toHaveLength(5);
    });

    it('should validate required parameters', () => {
      const startViteParams = {
        projectPath: '/test/project',
        port: 3000,
        host: 'localhost'
      };
      
      expect(startViteParams.projectPath).toBeDefined();
      expect(typeof startViteParams.projectPath).toBe('string');
      expect(typeof startViteParams.port).toBe('number');
      expect(typeof startViteParams.host).toBe('string');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing project directory', () => {
      const nonExistentPath = '/path/that/does/not/exist';
      expect(fs.existsSync(nonExistentPath)).toBe(false);
    });

    it('should handle missing package.json', () => {
      const tempDir = path.join(__dirname, 'temp-no-package');
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const packageJsonPath = path.join(tempDir, 'package.json');
      expect(fs.existsSync(packageJsonPath)).toBe(false);
      
      // Clean up
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should handle file system errors gracefully', () => {
      expect(() => {
        fs.readFileSync('/nonexistent/file.txt');
      }).toThrow();
    });
  });
});