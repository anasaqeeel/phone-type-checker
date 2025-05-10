"use client"

import React, { useState } from "react"
import * as XLSX from "xlsx"
import Papa from "papaparse"
import {
  Upload,
  FileUp,
  Download,
  Loader2,
  Phone,
  AlertCircle,
  Smartphone,
  FileText,
  Info,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react"

// Define types for validation results
interface ValidationResult {
  success: boolean
  valid: boolean
  line_type: string
  number?: string
  carrier?: string
  location?: string
  country?: string
  error?: string
}

interface HistoryItem {
  number: string
  lineType: string
  timestamp: string
  valid: boolean
}

// Clean number: remove everything except digits and ensure +1 prefix
const cleanNumber = (number: string | undefined | null): string | null => {
  if (!number) return null
  const cleaned = String(number).replace(/[^\d]/g, "")
  if (cleaned.length >= 10) {
    if (!cleaned.startsWith("1")) {
      return `+1${cleaned}`
    }
    return `+${cleaned}`
  }
  return null
}

// Detect if a column is likely to contain phone numbers
const isPhoneColumn = (column: (string | undefined | null)[]): boolean => {
  const matchCount = column.filter((value) => {
    const cleaned = cleanNumber(value)
    return cleaned && cleaned.length >= 10
  }).length
  return matchCount / column.length > 0.5
}

export default function Home() {
  const [tab, setTab] = useState<"single" | "file">("single")
  const [phoneNumber, setPhoneNumber] = useState<string>("")
  const [singleResult, setSingleResult] = useState<ValidationResult | null>(null)
  const [isValidating, setIsValidating] = useState<boolean>(false)
  const [file, setFile] = useState<File | null>(null)
  const [processedData, setProcessedData] = useState<Record<string, any>[]>([])
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [dragActive, setDragActive] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<number>(0)
  const [showPreview, setShowPreview] = useState<boolean>(false)
  const [previewData, setPreviewData] = useState<Record<string, any>[]>([])
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>([])
  const [showTooltip, setShowTooltip] = useState<boolean>(false)
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})
  const [statistics, setStatistics] = useState<{
    total: number
    mobile: number
    landline: number
    invalid: number
  } | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    console.log("File selected:", selectedFile ? selectedFile.name : "None")
    setFile(selectedFile || null)
    setErrorMessage(null)
    if (selectedFile) {
      generatePreview(selectedFile)
    }
  }

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      console.log("File dropped:", e.dataTransfer.files[0].name)
      setFile(e.dataTransfer.files[0])
      setErrorMessage(null)
      generatePreview(e.dataTransfer.files[0])
    }
  }

  const generatePreview = (file: File) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const data = event.target?.result as string
      let parsedData: Record<string, any>[] = []

      // For Excel files
      if (file.name.endsWith(".xlsx")) {
        const workbook = XLSX.read(data, { type: "binary" })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        parsedData = XLSX.utils.sheet_to_json(sheet)
      }

      // For CSV files
      if (file.name.endsWith(".csv")) {
        Papa.parse(data, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            parsedData = result.data as Record<string, any>[]
          },
        })
      }

      // Show first 5 rows as preview
      setPreviewData(parsedData.slice(0, 5))
      setShowPreview(true)
    }
    reader.readAsBinaryString(file)
  }

  const handleValidateSingle = async () => {
    if (!phoneNumber) {
      setSingleResult({ success: false, valid: false, line_type: "invalid", error: "Please enter a phone number" })
      return
    }
    const cleaned = cleanNumber(phoneNumber)
    if (!cleaned) {
      setSingleResult({ success: false, valid: false, line_type: "invalid", error: "Invalid phone number format" })
      return
    }

    setIsValidating(true)
    setErrorMessage(null)
    try {
      const response = await fetch(`/api/validate-number?number=${cleaned}`)
      const result: ValidationResult = await response.json()
      setSingleResult(result)

      // Add to recent history
      if (result.success) {
        setRecentHistory((prev) => {
          const newHistory = [
            {
              number: result.number || cleaned,
              lineType: result.line_type,
              timestamp: new Date().toLocaleTimeString(),
              valid: result.valid,
            },
            ...prev,
          ].slice(0, 5)
          return newHistory
        })
      }

      if (!result.success) {
        setErrorMessage(result.error || "Failed to validate number")
      }
    } catch (error) {
      setSingleResult({ success: false, valid: false, line_type: "invalid", error: "Network error" })
      setErrorMessage("Network error")
    }
    setIsValidating(false)
  }

  const handleProcessFile = async () => {
    if (!file) {
      setErrorMessage("Please select a file to process")
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)
    setProgress(0)
    const reader = new FileReader()
    reader.onload = async (event) => {
      const data = event.target?.result as string
      let parsedData: Record<string, any>[] = []

      if (file.name.endsWith(".xlsx")) {
        const workbook = XLSX.read(data, { type: "binary" })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        parsedData = XLSX.utils.sheet_to_json(sheet)
      } else if (file.name.endsWith(".csv")) {
        Papa.parse(data, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            parsedData = result.data as Record<string, any>[]
          },
        })
      }

      if (parsedData.length === 0) {
        setErrorMessage("Invalid file format or empty file")
        setIsProcessing(false)
        return
      }

      const potentialColumns = Object.keys(parsedData[0]).filter((column) => {
        const columnData = parsedData.map((row) => row[column])
        return isPhoneColumn(columnData)
      })
      console.log("Potential phone columns:", potentialColumns)

      const phoneNumbers: string[] = []
      for (const row of parsedData) {
        for (const column of potentialColumns) {
          const cleaned = cleanNumber(row[column])
          if (cleaned && !phoneNumbers.includes(cleaned)) {
            phoneNumbers.push(cleaned)
          }
        }
      }

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 95) {
            clearInterval(progressInterval)
            return 95
          }
          return prev + 5
        })
      }, 200)

      let validationResults: ValidationResult[] = []
      try {
        const response = await fetch("/api/validate-numbers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numbers: phoneNumbers }),
        })
        const result = await response.json()
        validationResults = result.results || []
      } catch (error) {
        validationResults = phoneNumbers.map((number) => ({
          number,
          valid: false,
          line_type: "invalid",
          error: "Network error",
        }))
      }

      clearInterval(progressInterval)
      setProgress(100)

      const updatedData = parsedData.map((row) => {
        let foundMobile: string | null = null
        let lineType = "Invalid"
        let error: string | null = null
        for (const column of potentialColumns) {
          const cleaned = cleanNumber(row[column])
          if (cleaned) {
            const result = validationResults.find((r) => r.number === cleaned)
            if (result) {
              if (result.valid) {
                lineType = result.line_type.charAt(0).toUpperCase() + result.line_type.slice(1)
                if (result.line_type === "mobile") {
                  foundMobile = cleaned
                }
              } else {
                lineType = "Invalid"
                error = result.error || "Validation failed"
              }
              break
            }
          }
        }
        return { ...row, "Valid Mobile Number": foundMobile || "Not Found", "Line Type": lineType, Error: error || "" }
      })

      // Calculate statistics
      const mobileCount = updatedData.filter((row) => row["Line Type"] === "Mobile").length
      const landlineCount = updatedData.filter((row) => row["Line Type"] === "Landline").length
      const invalidCount = updatedData.filter((row) => row["Line Type"] === "Invalid").length

      setStatistics({
        total: updatedData.length,
        mobile: mobileCount,
        landline: landlineCount,
        invalid: invalidCount,
      })

      const hasErrors = validationResults.some((r) => !r.valid)
      if (hasErrors) {
        setErrorMessage("Some numbers could not be validated due to API issues. Check the output file for details.")
      }

      setProcessedData(updatedData)
      setIsProcessing(false)
    }
    reader.readAsBinaryString(file)
  }

  const handleDownloadFile = () => {
    if (processedData.length === 0) return

    const worksheet = XLSX.utils.json_to_sheet(processedData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Processed Data")
    XLSX.writeFile(workbook, `processed_${file?.name}`)
  }

  const toggleRowExpand = (index: number) => {
    setExpandedRows((prev) => ({
      ...prev,
      [index]: !prev[index],
    }))
  }

  const renderResultCard = (result: ValidationResult | null) => {
    if (!result) return null

    const isMobile = result.valid && result.line_type === "mobile"
    const isLandline = result.valid && result.line_type === "landline"
    const isInvalid = !result.valid || result.line_type === "invalid"

    return (
      <div
        className={`mt-6 overflow-hidden rounded-lg shadow-md border-l-4 ${
          isMobile
            ? "border-l-green-500 bg-green-50"
            : isLandline
              ? "border-l-amber-500 bg-amber-50"
              : "border-l-red-500 bg-red-50"
        }`}
        style={{
          opacity: 1,
          transform: "translateY(0px)",
          transition: "opacity 0.3s, transform 0.3s",
        }}
      >
        <div className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isMobile && <Smartphone className="h-5 w-5 text-green-600" />}
              {isLandline && <Phone className="h-5 w-5 text-amber-600" />}
              {isInvalid && <AlertCircle className="h-5 w-5 text-red-600" />}
              <h3 className="text-base font-semibold">
                {isMobile ? "Mobile Number" : isLandline ? "Landline Number" : "Invalid Number"}
              </h3>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isMobile
                  ? "bg-green-100 text-green-800"
                  : isLandline
                    ? "bg-amber-100 text-amber-800"
                    : "bg-red-100 text-red-800"
              }`}
            >
              {isMobile ? "Mobile" : isLandline ? "Landline" : "Invalid"}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {result.error || (result.valid ? "Valid phone number detected" : "Number validation failed")}
          </p>
        </div>
        <div className="p-4 pt-0">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">Number</span>
              <span className="font-medium">{result.number || "N/A"}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">Carrier</span>
              <span className="font-medium">{result.carrier || "N/A"}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">Location</span>
              <span className="font-medium">{result.location || "N/A"}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">Country</span>
              <span className="font-medium">{result.country || "N/A"}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderFilePreview = () => {
    if (!showPreview || previewData.length === 0) return null

    const columns = Object.keys(previewData[0]).slice(0, 5) // Show only first 5 columns

    return (
      <div className="mt-4 rounded-lg shadow-md bg-white overflow-hidden border border-gray-200">
        <div className="p-4 pb-2 flex items-center justify-between bg-gray-50 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold">File Preview</h3>
            <p className="text-xs text-gray-500">First 5 rows of your file</p>
          </div>
          <button
            className="p-1 rounded-full hover:bg-gray-200 transition-colors"
            onClick={() => setShowPreview(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-0 overflow-auto max-h-64">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((column, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {previewData.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {columns.map((column, j) => (
                    <td key={j} className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {row[column]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderProcessedResults = () => {
    if (!processedData.length || !statistics) return null

    const { total, mobile, landline, invalid } = statistics

    return (
      <div className="space-y-6">
        <div className="rounded-lg shadow-md bg-white overflow-hidden border border-gray-200">
          <div className="p-4 pb-2 bg-gray-50 border-b border-gray-200">
            <h3 className="text-base font-semibold">Processing Results</h3>
            <p className="text-sm text-gray-500">Summary of phone number validation</p>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col items-center p-3 bg-green-50 rounded-lg border border-green-100">
                <Smartphone className="h-5 w-5 text-green-600 mb-1" />
                <span className="text-xl font-bold text-green-600">{mobile}</span>
                <span className="text-xs text-green-700">Mobile</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-amber-50 rounded-lg border border-amber-100">
                <Phone className="h-5 w-5 text-amber-600 mb-1" />
                <span className="text-xl font-bold text-amber-600">{landline}</span>
                <span className="text-xs text-amber-700">Landline</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-red-50 rounded-lg border border-red-100">
                <AlertCircle className="h-5 w-5 text-red-600 mb-1" />
                <span className="text-xl font-bold text-red-600">{invalid}</span>
                <span className="text-xs text-red-700">Invalid</span>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1">
                <span>Mobile: {Math.round((mobile / total) * 100)}%</span>
                <span>Landline: {Math.round((landline / total) * 100)}%</span>
                <span>Invalid: {Math.round((invalid / total) * 100)}%</span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden">
                <div className="bg-green-500" style={{ width: `${(mobile / total) * 100}%` }} />
                <div className="bg-amber-500" style={{ width: `${(landline / total) * 100}%` }} />
                <div className="bg-red-500" style={{ width: `${(invalid / total) * 100}%` }} />
              </div>
            </div>
          </div>
          <div className="p-4 pt-0 flex flex-col gap-2 border-t border-gray-200 mt-4">
            <button
              className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-md flex items-center justify-center gap-2 transition-colors"
              onClick={handleDownloadFile}
            >
              <Download className="h-4 w-4" />
              Download Processed File
            </button>
            <button
              className="w-full py-2 px-4 border border-gray-300 hover:bg-gray-50 rounded-md transition-colors"
              onClick={() => {
                setProcessedData([])
                setFile(null)
                setShowPreview(false)
                setStatistics(null)
              }}
            >
              Process Another File
            </button>
          </div>
        </div>

        <div className="rounded-lg shadow-md bg-white overflow-hidden border border-gray-200">
          <div className="p-4 pb-2 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Sample Results</h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                {processedData.length} Total Records
              </span>
            </div>
          </div>
          <div className="overflow-auto max-h-96">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Number
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {processedData.slice(0, 10).map((row, i) => (
                  <React.Fragment key={i}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {row["Valid Mobile Number"] !== "Not Found"
                          ? row["Valid Mobile Number"]
                          : Object.values(row)[0]}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{row["Line Type"]}</td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            row["Line Type"] === "Mobile"
                              ? "bg-green-100 text-green-800"
                              : row["Line Type"] === "Landline"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-red-100 text-red-800"
                          }`}
                        >
                          {row["Line Type"] === "Mobile"
                            ? "Valid Mobile"
                            : row["Line Type"] === "Landline"
                              ? "Landline"
                              : "Invalid"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <button
                          className="flex items-center text-blue-600 hover:text-blue-800"
                          onClick={() => toggleRowExpand(i)}
                        >
                          {expandedRows[i] ? (
                            <>
                              <ChevronUp className="h-4 w-4 mr-1" />
                              Hide
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4 mr-1" />
                              Show
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                    {expandedRows[i] && (
                      <tr className="bg-gray-50">
                        <td colSpan={4} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            {Object.entries(row).map(([key, value], j) => {
                              // Skip the columns we already show
                              if (key === "Valid Mobile Number" || key === "Line Type") return null
                              return (
                                <div key={j} className="flex flex-col">
                                  <span className="text-xs text-gray-500">{key}</span>
                                  <span className="font-medium">{value || "N/A"}</span>
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-8 px-4">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Phone Number Validator</h1>
          <p className="text-gray-500 mt-2">Validate phone numbers and identify mobile vs landline numbers</p>
        </div>

        {errorMessage && (
          <div className="p-4 mb-6 bg-red-50 border border-red-200 rounded-lg text-center shadow-sm">
            <p className="text-sm text-red-700 font-medium flex items-center justify-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              {errorMessage}
            </p>
          </div>
        )}

        <div className="mb-6">
          <div className="grid grid-cols-2 bg-gray-100 p-1 rounded-lg shadow-sm">
            <button
              className={`py-2 px-4 rounded-md flex items-center justify-center gap-2 transition-colors ${
                tab === "single" ? "bg-white shadow-sm" : "text-gray-600 hover:bg-gray-200"
              }`}
              onClick={() => setTab("single")}
            >
              <Smartphone className="h-4 w-4" />
              <span>Single Number</span>
            </button>
            <button
              className={`py-2 px-4 rounded-md flex items-center justify-center gap-2 transition-colors ${
                tab === "file" ? "bg-white shadow-sm" : "text-gray-600 hover:bg-gray-200"
              }`}
              onClick={() => setTab("file")}
            >
              <FileText className="h-4 w-4" />
              <span>Bulk Processing</span>
            </button>
          </div>
        </div>

        {tab === "single" ? (
          <div className="space-y-6">
            <div className="rounded-lg shadow-md bg-white overflow-hidden border border-gray-200">
              <div className="p-4 pb-2 bg-gray-50 border-b border-gray-200">
                <h3 className="text-base font-semibold">Validate a Phone Number</h3>
                <p className="text-sm text-gray-500">Enter a phone number to check if it's a mobile or landline</p>
              </div>
              <div className="p-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Enter phone number (e.g., +14155552671)"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleValidateSingle}
                    disabled={isValidating || !phoneNumber}
                    className={`px-4 py-2 rounded-md flex items-center gap-2 ${
                      isValidating || !phoneNumber
                        ? "bg-gray-300 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {isValidating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      "Validate"
                    )}
                  </button>
                </div>

                <div className="mt-4 relative">
                  <div
                    className="flex items-center text-xs text-gray-500 cursor-pointer"
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                  >
                    <Info className="h-3 w-3 mr-1" />
                    <span>Format tips</span>
                  </div>
                  {showTooltip && (
                    <div className="absolute left-0 mt-1 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10 max-w-xs">
                      Enter numbers with or without country code.
                      <br />
                      Examples: +14155552671, 14155552671, or 4155552671
                    </div>
                  )}
                </div>
              </div>
            </div>

            {renderResultCard(singleResult)}

            {recentHistory.length > 0 && (
              <div className="rounded-lg shadow-md bg-white overflow-hidden border border-gray-200">
                <div className="p-4 pb-2 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">Recent Validations</h3>
                    <span className="flex items-center text-xs text-gray-500">
                      <Clock className="h-3 w-3 mr-1" />
                      History
                    </span>
                  </div>
                </div>
                <div className="overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Number
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {recentHistory.map((item, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.number}</td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                item.lineType === "mobile"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {item.lineType === "mobile" ? "Mobile" : "Landline"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{item.timestamp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {!processedData.length ? (
              <div className="rounded-lg shadow-md bg-white overflow-hidden border border-gray-200">
                <div className="p-4 pb-2 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-base font-semibold">Bulk Phone Number Validation</h3>
                  <p className="text-sm text-gray-500">Upload a file with phone numbers to validate in bulk</p>
                </div>
                <div className="p-4">
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center ${
                      dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
                    }`}
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                  >
                    <div className="flex flex-col items-center justify-center space-y-4">
                      <div className="p-3 rounded-full bg-blue-100">
                        <Upload className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">Drag and drop your file here or click to browse</p>
                        <p className="text-sm text-gray-500 mt-1">Supports Excel (.xlsx) and CSV (.csv) files</p>
                      </div>
                      <label htmlFor="file-upload" className="cursor-pointer">
                        <input
                          id="file-upload"
                          type="file"
                          className="hidden"
                          accept=".xlsx,.csv"
                          onChange={handleFileChange}
                        />
                        <button
                          type="button"
                          className="px-4 py-2 border border-gray-300 rounded-md flex items-center gap-2 hover:bg-gray-50 transition-colors"
                        >
                          <FileUp className="h-4 w-4" />
                          Browse Files
                        </button>
                      </label>
                    </div>
                  </div>

                  {file && (
                    <div className="mt-4 space-y-4">
                      <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium">{file.name}</p>
                            <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                          </div>
                          <button
                            className="p-1 rounded-full hover:bg-gray-200 transition-colors"
                            onClick={() => {
                              setFile(null)
                              setShowPreview(false)
                            }}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {renderFilePreview()}

                      <button
                        onClick={handleProcessFile}
                        disabled={isProcessing}
                        className={`w-full px-4 py-2 rounded-md flex items-center justify-center gap-2 ${
                          isProcessing ? "bg-gray-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"
                        }`}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Processing... {progress}%
                          </>
                        ) : (
                          <>Process File</>
                        )}
                      </button>

                      {isProcessing && (
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              renderProcessedResults()
            )}
          </div>
        )}
      </div>
    </main>
  )
}
