"use client"

import React, { useState } from 'react'
import { Landmark, Copy, Plus, Trash2, Pencil, Check, Download, ChevronDown, ChevronUp } from 'lucide-react'
import { BankAccountDTO } from '@/app/actions/vault'
import { Modal, Input, Button } from '@/design-system'
import { notify } from '@/lib/notifications'

export interface BankPassbookSectionProps {
  bankAccounts: BankAccountDTO[]
  onSaveBank: (bankData: {
    id?: string
    bankName: string
    accountHolder: string
    accountNumber: string
    ifscCode: string
    branch?: string
    accountType?: string
    upiId?: string
    documentId?: string | null
  }) => Promise<void>
  onDeleteBank: (id: string, bankName: string) => Promise<void>
  onUploadDocForField?: (fieldId: string, label: string) => void
  onDownloadDoc?: (docId: string) => void
}

export function BankPassbookSection({
  bankAccounts,
  onSaveBank,
  onDeleteBank,
  _onUploadDocForField,
  onDownloadDoc,
}: BankPassbookSectionProps & { _onUploadDocForField?: (fieldId: string, label: string) => void }) {
  const [expandedBankIds, setExpandedBankIds] = useState<Record<string, boolean>>({})
  const [showBankModal, setShowBankModal] = useState(false)
  const [editingBankId, setEditingBankId] = useState<string | null>(null)
  const [bankName, setBankName] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifscCode, setIfscCode] = useState('')
  const [branch, setBranch] = useState('')
  const [_city, setCity] = useState('')
  const [accountType, setAccountType] = useState('Savings')
  const [upiId, setUpiId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLookingUpIfsc, setIsLookingUpIfsc] = useState(false)
  const [ifscValidStatus, setIfscValidStatus] = useState<'valid' | 'invalid' | null>(null)
  const [ifscBankDetails, setIfscBankDetails] = useState<{
    bank: string
    branch: string
    address: string
    city: string
    state: string
  } | null>(null)

  const toggleExpand = (id: string) => {
    setExpandedBankIds(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const openNewBankModal = () => {
    setEditingBankId(null)
    setBankName('')
    setAccountHolder('')
    setAccountNumber('')
    setIfscCode('')
    setBranch('')
    setCity('')
    setAccountType('Savings')
    setUpiId('')
    setIfscValidStatus(null)
    setIfscBankDetails(null)
    setShowBankModal(true)
  }

  const openEditBankModal = (b: BankAccountDTO) => {
    setEditingBankId(b.id)
    setBankName(b.bankName)
    setAccountHolder(b.accountHolder)
    setAccountNumber(b.accountNumber)
    setIfscCode(b.ifscCode)
    setBranch(b.branch || '')
    setCity('')
    setAccountType(b.accountType || 'Savings')
    setUpiId(b.upiId || '')
    setIfscValidStatus(null)
    setIfscBankDetails(null)
    setShowBankModal(true)
  }

  // Automatic IFSC Lookup using official open-source Razorpay/RBI IFSC API
  const lookupIfsc = async (code: string) => {
    const cleanCode = code.trim().toUpperCase()
    if (cleanCode.length !== 11) {
      setIfscValidStatus(null)
      setIfscBankDetails(null)
      return
    }

    setIsLookingUpIfsc(true)
    try {
      const res = await fetch(`https://ifsc.razorpay.com/${cleanCode}`)
      if (res.ok) {
        const data = await res.json()
        setIfscValidStatus('valid')
        setIfscBankDetails({
          bank: data.BANK || '',
          branch: data.BRANCH || '',
          address: data.ADDRESS || '',
          city: data.CITY || '',
          state: data.STATE || ''
        })
        
        // Auto-fill bank name and branch if empty or user wants
        if (!bankName || bankName.trim() === '') {
          setBankName(data.BANK || '')
        }
        if (data.BRANCH) {
          setBranch(data.BRANCH)
        }
        if (data.CITY) {
          setCity(data.CITY)
        }
        notify.success(`Verified: ${data.BANK} (${data.BRANCH})`)
      } else {
        setIfscValidStatus('invalid')
        setIfscBankDetails(null)
        notify.error('Invalid IFSC Code. Please verify.')
      }
    } catch {
      setIfscValidStatus(null)
    } finally {
      setIsLookingUpIfsc(false)
    }
  }

  const handleCopy = async (text: string, label: string) => {
    if (!text) return
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        notify.success(`Copied ${label} to clipboard`)
      }
    } catch {
      notify.error(`Failed to copy ${label}`)
    }
  }

  const handleSave = async () => {
    if (!bankName.trim() || !accountHolder.trim() || !accountNumber.trim() || !ifscCode.trim()) {
      notify.error('Please fill in all required fields (Bank, Holder, Account No, IFSC)')
      return
    }

    setIsSaving(true)
    try {
      await onSaveBank({
        id: editingBankId || undefined,
        bankName,
        accountHolder,
        accountNumber,
        ifscCode,
        branch: branch || (ifscBankDetails?.branch ?? undefined),
        accountType,
        upiId,
      })
      setShowBankModal(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-[var(--radius-md)] bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Landmark className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--color-text-main)]">Bank Accounts &amp; Passbooks</h3>
            <p className="text-[11px] text-[var(--color-text-muted)]">Encrypted banking details with fast 1-click copying for forms</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={openNewBankModal}
          icon={<Plus className="w-3.5 h-3.5" />}
          className="h-8 text-xs font-semibold"
        >
          Add Bank
        </Button>
      </div>

      {/* Bank Passbooks Grid */}
      {bankAccounts.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-[var(--radius-lg)] p-8 text-center bg-[var(--color-bg-surface)]/50">
          <Landmark className="w-8 h-8 text-[var(--color-text-muted)]/40 mx-auto mb-2" />
          <p className="text-xs font-semibold text-[var(--color-text-main)]">No bank accounts added yet</p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Store multiple banks with a realistic passbook view and instant copy shortcuts.</p>
          <Button
            size="sm"
            variant="primary"
            onClick={openNewBankModal}
            icon={<Plus className="w-3.5 h-3.5" />}
            className="mt-3 text-xs"
          >
            Add First Bank Account
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {bankAccounts.map((bank) => {
            const isExpanded = !!expandedBankIds[bank.id]

            return (
              <div
                key={bank.id}
                className="relative overflow-hidden rounded-[var(--radius-lg)] border border-amber-900/20 dark:border-amber-500/20 bg-linear-to-br from-amber-50/70 via-stone-50 to-amber-100/50 dark:from-zinc-900 dark:via-zinc-900/90 dark:to-amber-950/30 p-4 shadow-xs transition-all hover:shadow-md group"
              >
                {/* Passbook Decorative Spine */}
                <div className="absolute top-0 left-0 bottom-0 w-2 bg-linear-to-b from-amber-700 via-amber-800 to-amber-900 opacity-80" />

                {/* Collapsed / Click-to-Expand Header */}
                <div className="pl-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => toggleExpand(bank.id)}
                    className="flex-1 flex items-center gap-2.5 text-left cursor-pointer select-none"
                  >
                    <div className="w-7 h-7 rounded-full bg-amber-600/10 dark:bg-amber-400/10 border border-amber-600/30 flex items-center justify-center shrink-0">
                      <Landmark className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-black uppercase tracking-wider text-amber-950 dark:text-amber-100 truncate">
                        {bank.bankName}
                      </h4>
                      <p className="text-[10px] text-amber-800/70 dark:text-amber-400/70 font-mono truncate">
                        {bank.maskedAccountNumber || '••••••••'} &bull; {bank.accountType || 'Savings'}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(bank.accountNumber, 'Account Number')}
                      title="Copy Account Number"
                      className="p-1.5 text-amber-800/80 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 rounded-[var(--radius-sm)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditBankModal(bank)}
                      title="Edit Bank"
                      className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-[var(--radius-sm)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBank(bank.id, bank.bankName)}
                      title="Delete Bank"
                      className="p-1.5 text-rose-400 hover:text-rose-600 rounded-[var(--radius-sm)] hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExpand(bank.id)}
                      title={isExpanded ? 'Collapse' : 'Expand Passbook'}
                      className="p-1.5 text-amber-800/70 dark:text-amber-400/70 hover:text-amber-950 dark:hover:text-amber-100 rounded-[var(--radius-sm)] cursor-pointer"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Full Passbook Details */}
                {isExpanded && (
                  <div className="mt-3 pt-3 pl-2 border-t border-amber-900/10 dark:border-amber-500/10 space-y-2.5 animate-in fade-in duration-200">
                    {/* Account Holder */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400">Account Holder:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 uppercase">{bank.accountHolder}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(bank.accountHolder, 'Account Holder')}
                          title="Copy Holder Name"
                          className="p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Account Number */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400">Account Number:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          {bank.accountNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(bank.accountNumber, 'Account Number')}
                          title="Copy Account Number"
                          className="p-1 text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* IFSC Code & Branch */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400">IFSC Code:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{bank.ifscCode}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(bank.ifscCode, 'IFSC Code')}
                          title="Copy IFSC Code"
                          className="p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Optional Branch */}
                    {bank.branch && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400">Branch:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-800 dark:text-zinc-200 font-medium">{bank.branch}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(bank.branch!, 'Branch')}
                            title="Copy Branch"
                            className="p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Optional UPI ID */}
                    {bank.upiId && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400">UPI ID:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-zinc-800 dark:text-zinc-200">{bank.upiId}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(bank.upiId!, 'UPI ID')}
                            title="Copy UPI ID"
                            className="p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Passbook Bottom Bar: Quick Copy All & Actions */}
                    <div className="mt-3.5 pt-2.5 border-t border-amber-900/10 dark:border-amber-500/10 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const fullDetails = `Bank: ${bank.bankName}\nHolder: ${bank.accountHolder}\nAccount No: ${bank.accountNumber}\nIFSC: ${bank.ifscCode}${bank.branch ? `\nBranch: ${bank.branch}` : ''}${bank.upiId ? `\nUPI: ${bank.upiId}` : ''}`
                          handleCopy(fullDetails, 'All Bank Details')
                        }}
                        className="flex items-center gap-1 text-[11px] font-bold text-amber-900 dark:text-amber-300 hover:text-amber-700 cursor-pointer transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy All Details</span>
                      </button>

                      {bank.documentId && onDownloadDoc && (
                        <button
                          type="button"
                          onClick={() => onDownloadDoc(bank.documentId!)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>Passbook Doc</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Realistic Passbook Input Modal */}
      <Modal
        isOpen={showBankModal}
        onClose={() => setShowBankModal(false)}
        title={editingBankId ? 'Edit Bank Passbook' : 'New Bank Passbook'}
        size="md"
      >
        <div className="space-y-4 pt-1">
          {/* Visual Passbook Cover Header in Modal */}
          <div className="bg-linear-to-r from-amber-800 via-amber-900 to-amber-950 p-3.5 rounded-[var(--radius-md)] text-amber-100 flex items-center gap-3 border border-amber-700/50 shadow-inner">
            <Landmark className="w-6 h-6 text-amber-300 shrink-0" />
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-amber-200">Bank Account Passbook</p>
              <p className="text-[10px] text-amber-300/80">Confidential credentials are encrypted with AES-256-GCM.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              type="text"
              label="Account Number *"
              placeholder="e.g. 50100492817261"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value)}
            />

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">IFSC Code *</label>
                {isLookingUpIfsc && (
                  <span className="text-[10px] text-blue-500 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" /> Checking IFSC...
                  </span>
                )}
                {!isLookingUpIfsc && ifscValidStatus === 'valid' && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5">
                    <Check className="w-3 h-3" /> Verified RBI Branch
                  </span>
                )}
                {!isLookingUpIfsc && ifscValidStatus === 'invalid' && (
                  <span className="text-[10px] text-rose-500 font-bold">
                    Invalid IFSC Code
                  </span>
                )}
              </div>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="e.g. HDFC0001234"
                  value={ifscCode}
                  onChange={e => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11)
                    setIfscCode(val)
                    if (val.length === 11) {
                      lookupIfsc(val)
                    } else {
                      setIfscValidStatus(null)
                      setIfscBankDetails(null)
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Auto-detected Branch & Bank Confirmation Card */}
          {ifscBankDetails && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[var(--radius-md)] p-3 text-xs space-y-1">
              <div className="flex items-center justify-between font-bold text-emerald-800 dark:text-emerald-300">
                <span>{ifscBankDetails.bank}</span>
                <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded font-mono">{ifscCode}</span>
              </div>
              <p className="text-[11px] text-emerald-900/80 dark:text-emerald-200/80">
                <span className="font-semibold">Branch:</span> {ifscBankDetails.branch} &bull; {ifscBankDetails.city}, {ifscBankDetails.state}
              </p>
              {ifscBankDetails.address && (
                <p className="text-[10px] text-[var(--color-text-muted)] truncate">
                  {ifscBankDetails.address}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              type="text"
              label="Bank Name *"
              placeholder="e.g. HDFC Bank, SBI, ICICI"
              value={bankName}
              onChange={e => setBankName(e.target.value)}
            />

            <Input
              type="text"
              label="Account Holder Name *"
              placeholder="e.g. CHINMAY SHARMA"
              value={accountHolder}
              onChange={e => setAccountHolder(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              type="text"
              label="Branch Name"
              placeholder="e.g. Connaught Place"
              value={branch}
              onChange={e => setBranch(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">Account Type</label>
              <select
                value={accountType}
                onChange={e => setAccountType(e.target.value)}
                className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-2 text-sm text-[var(--color-text-main)] focus:outline-none"
              >
                <option value="Savings">Savings</option>
                <option value="Current">Current</option>
                <option value="Salary">Salary</option>
                <option value="NRE/NRO">NRE/NRO</option>
              </select>
            </div>

            <Input
              type="text"
              label="UPI ID (optional)"
              placeholder="e.g. user@okhdfcbank"
              value={upiId}
              onChange={e => setUpiId(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <Button variant="outline" size="sm" onClick={() => setShowBankModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={isSaving}
              icon={<Check className="w-4 h-4" />}
            >
              {editingBankId ? 'Save Changes' : 'Add Bank Passbook'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
