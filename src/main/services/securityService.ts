import { safeStorage, app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export class SecurityService {
  private vaultPath: string
  // 上次加载时 vault 文件存在但解密/解析失败：保存前必须先备份原文件，绝不无备份覆盖
  private vaultCorrupted = false
  // 简单内存互斥（Promise 链）：串行化读-改-写，防止并发保存互相覆盖丢更新
  private mutex: Promise<unknown> = Promise.resolve()

  constructor() {
    this.vaultPath = path.join(app.getPath('userData'), 'vault.enc')
  }

  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.mutex.then(task, task)
    this.mutex = result.catch(() => {})
    return result
  }

  private async loadVault(): Promise<Record<string, string>> {
    let buffer: Buffer
    try {
      buffer = await fs.readFile(this.vaultPath)
    } catch {
      // 文件不存在：视为全新的空 vault，不算损坏
      this.vaultCorrupted = false
      return {}
    }
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(buffer)
        const data = JSON.parse(decrypted)
        this.vaultCorrupted = false
        return data
      } else {
        // Fallback AES-256
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.getMachineFallbackKey(), Buffer.alloc(16, 0))
        const decrypted = Buffer.concat([decipher.update(buffer), decipher.final()]).toString('utf-8')
        const data = JSON.parse(decrypted)
        this.vaultCorrupted = false
        return data
      }
    } catch {
      // 文件存在但解密/解析失败：记录损坏状态，避免后续 save 静默覆盖全部密钥
      this.vaultCorrupted = true
      return {}
    }
  }

  private async saveVault(data: Record<string, string>): Promise<void> {
    const rawStr = JSON.stringify(data)
    let buffer: Buffer
    if (safeStorage.isEncryptionAvailable()) {
      buffer = safeStorage.encryptString(rawStr)
    } else {
      const cipher = crypto.createCipheriv('aes-256-cbc', this.getMachineFallbackKey(), Buffer.alloc(16, 0))
      buffer = Buffer.concat([cipher.update(Buffer.from(rawStr, 'utf-8')), cipher.final()])
    }
    await fs.mkdir(path.dirname(this.vaultPath), { recursive: true })
    await fs.writeFile(this.vaultPath, buffer)
  }

  private getMachineFallbackKey(): Buffer {
    const seed = `${process.env.USERNAME || 'default'}_${process.env.COMPUTERNAME || 'pc'}_PDFOpenStudio`
    return crypto.createHash('sha256').update(seed).digest()
  }

  async saveSecureKey(service: string, key: string, value: string): Promise<boolean> {
    return this.runExclusive(async () => {
      try {
        const vault = await this.loadVault()
        if (this.vaultCorrupted) {
          // vault 文件存在但上次加载失败：先备份原文件（vault.corrupt.<时间戳>）再写入，避免密钥静默丢失
          try {
            await fs.copyFile(this.vaultPath, `${this.vaultPath}.corrupt.${Date.now()}`)
          } catch {}
        }
        vault[`${service}:${key}`] = value
        await this.saveVault(vault)
        return true
      } catch {
        return false
      }
    })
  }

  async getSecureKey(service: string, key: string): Promise<string | null> {
    return this.runExclusive(async () => {
      try {
        const vault = await this.loadVault()
        return vault[`${service}:${key}`] || null
      } catch {
        return null
      }
    })
  }
}
