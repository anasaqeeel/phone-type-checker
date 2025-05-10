"use client"

import { useState } from "react"
import * as XLSX from "xlsx"
import Papa from "papaparse"
import { Upload, FileUp, Download, Loader2, Phone, AlertCircle, Smartphone, FileText, Info, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Clean number: remove everything except digits and ensure +1 prefix
const cleanNumber = (number) => {
  if (!number) return null
  number = String(number).replace(/[^\d]/g, "") // Remove non-digit characters
  if (number.length >= 10) {
    if (!number.startsWith("1")) {
      number = "1" + number // Assuming US numbers, add +1 if not present
    }
    return `+${number}`
  }
  return null
}

// Detect if a column is likely to contain phone numbers
const isPhoneColumn = (column) => {
  const matchCount = column.filter((value) => {
    const cleaned = cleanNumber(value)
    return cleaned && cleaned.length >= 10
  }).length
  return matchCount / column.length > 0.5 // At least 50% look like numbers
}

// Validate a single phone number
const validatePhoneNumber = async (number) => {
  try {
    console.log("Validating number:", number)
    const response = await fetch(`http://localhost:5000/validate-number?number=${number}`)
    const result = await response.json()
    console.log("Validation result:", result)
    return result
  } catch (error) {
    console.error("Error validating number:", error)
    return { success: false, valid: false, line_type: "invalid", error: "Network error" }
  }
}

// Validate multiple phone numbers (for file processing)
const validateNumbersBulk = async (numbers) => {
  try {
    console.log("Validating numbers:", numbers)
    const response = await fetch("http://localhost:5000/validate-numbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numbers }),
    })
    const result = await response.json()
    console.log("Bulk validation result:", result)
    return result.results || []
  } catch (error) {
    console.error("Error validating numbers:", error)
    return numbers.map((number) => ({
      number,
      valid: false,
      line_type: "invalid",
      error: "Network error",
    }))
  }
}

export default function PhoneValidator() {
  const [phoneNumber, setPhoneNumber] = useState("")
  const [singleResult, setSingleResult] = useState(null)
  const [isValidating, setIsValidating] = useState(false)
  const [file, setFile] = useState(null)
  const [processedData, setProcessedData] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState([])
  const [recentHistory, setRecentHistory] = useState([])

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    console.log("File selected:", selectedFile ? selectedFile.name : "None")
    setFile(selectedFile || null)
    if (selectedFile) {
      generatePreview(selectedFile)
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      console.log("File dropped:", e.dataTransfer.files[0].name)
      setFile(e.dataTransfer.files[0])
      generatePreview(e.dataTransfer.files[0])
    }
  }

  const generatePreview = (file) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const data = event.target.result
      let parsedData = []

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
            parsedData = result.data
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
    const result = await validatePhoneNumber(cleaned)
    setSingleResult(result)
    setIsValidating(false)

    // Add to recent history
    if (result.valid) {
      setRecentHistory((prev) => {
        const newHistory = [
          {
            number: result.number,
            lineType: result.line_type,
            timestamp: new Date().toLocaleTimeString(),
          },
          ...prev,
        ].slice(0, 5)
        return newHistory
      })
    }
  }

  const handleProcessFile = async () => {
    if (!file) return

    setIsProcessing(true)
    setProgress(0)
    const reader = new FileReader()
    reader.onload = async (event) => {
      const data = event.target.result
      let parsedData = []

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
            parsedData = result.data
          },
        })
      }

      if (parsedData.length === 0) {
        alert("Invalid file format or empty file.")
        setIsProcessing(false)
        return
      }

      // Detect phone number columns
      const potentialColumns = Object.keys(parsedData[0]).filter((column) => {
        const columnData = parsedData.map((row) => row[column])
        return isPhoneColumn(columnData)
      })
      console.log("Potential phone columns:", potentialColumns)

      // Collect all phone numbers
      const phoneNumbers = []
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

      // Validate numbers in bulk
      const validationResults = await validateNumbersBulk(phoneNumbers)

      clearInterval(progressInterval)
      setProgress(100)

      // Map results back to rows
      const updatedData = parsedData.map((row) => {
        let foundMobile = null
        let lineType = "Invalid"
        for (const column of potentialColumns) {
          const cleaned = cleanNumber(row[column])
          if (cleaned) {
            const result = validationResults.find((r) => r.number === cleaned)
            if (result && result.valid) {
              lineType = result.line_type.charAt(0).toUpperCase() + result.line_type.slice(1)
              if (result.line_type === "mobile") {
                foundMobile = cleaned
              }
              break
            }
          }
        }
        return { ...row, "Valid Mobile Number": foundMobile || "Not Found", "Line Type": lineType }
      })

      // Calculate statistics
      const mobileCount = updatedData.filter((row) => row["Line Type"] === "Mobile").length
      const landlineCount = updatedData.filter((row) => row["Line Type"] === "Landline").length
      const invalidCount = updatedData.filter((row) => row["Line Type"] === "Invalid").length

      // Add statistics to the first row for display
      updatedData.statistics = {
        total: updatedData.length,
        mobile: mobileCount,
        landline: landlineCount,
        invalid: invalidCount,
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
    XLSX.writeFile(workbook, `processed_${file.name}`)
  }

  // Render result card for single number
  const renderResultCard = (result) => {
    if (!result) return null

    const isMobile = result.valid && result.line_type === "mobile"
    const isLandline = result.valid && result.line_type === "landline"
    const isInvalid = !result.valid || result.line_type === "invalid"

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          <Card
            className={`overflow-hidden border-l-4 ${
              isMobile ? "border-l-green-500" : isLandline ? "border-l-amber-500" : "border-l-red-500"
            }`}
          >
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isMobile && <Smartphone className="h-5 w-5 text-green-600" />}
                  {isLandline && <Phone className="h-5 w-5 text-amber-600" />}
                  {isInvalid && <AlertCircle className="h-5 w-5 text-red-600" />}
                  <CardTitle className="text-base">
                    {isMobile ? "Mobile Number" : isLandline ? "Landline Number" : "Invalid Number"}
                  </CardTitle>
                </div>
                <Badge variant={isMobile ? "success" : isLandline ? "warning" : "destructive"}>
                  {isMobile ? "Mobile" : isLandline ? "Landline" : "Invalid"}
                </Badge>
              </div>
              <CardDescription>
                {result.error || (result.valid ? "Valid phone number detected" : "Number validation failed")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Number</span>
                  <span className="font-medium">{result.number || "N/A"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Carrier</span>
                  <span className="font-medium">{result.carrier || "N/A"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Location</span>
                  <span className="font-medium">{result.location || "N/A"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Country</span>
                  <span className="font-medium">{result.country || "N/A"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    )
  }

  const renderFilePreview = () => {
    if (!showPreview || previewData.length === 0) return null

    const columns = Object.keys(previewData[0]).slice(0, 5) // Show only first 5 columns

    return (
      <Card className="mt-4">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">File Preview</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>First 5 rows of your file</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column, i) => (
                  <TableHead key={i} className="text-xs">
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewData.map((row, i) => (
                <TableRow key={i}>
                  {columns.map((column, j) => (
                    <TableCell key={j} className="text-xs py-2">
                      {row[column]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  const renderProcessedResults = () => {
    if (!processedData.length || !processedData.statistics) return null

    const { total, mobile, landline, invalid } = processedData.statistics

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Processing Results</CardTitle>
            <CardDescription>Summary of phone number validation</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col items-center p-3 bg-green-50 rounded-lg">
                <Smartphone className="h-5 w-5 text-green-600 mb-1" />
                <span className="text-xl font-bold text-green-600">{mobile}</span>
                <span className="text-xs text-green-700">Mobile</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-amber-50 rounded-lg">
                <Phone className="h-5 w-5 text-amber-600 mb-1" />
                <span className="text-xl font-bold text-amber-600">{landline}</span>
                <span className="text-xs text-amber-700">Landline</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-red-50 rounded-lg">
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
          </CardContent>
          <CardFooter className="p-4 pt-0 flex flex-col gap-2">
            <Button className="w-full gap-2" onClick={handleDownloadFile}>
              <Download className="h-4 w-4" />
              Download Processed File
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setProcessedData([])
                setFile(null)
                setShowPreview(false)
              }}
            >
              Process Another File
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Sample Results</CardTitle>
              <Badge variant="outline">{processedData.length} Total Records</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedData.slice(0, 5).map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {row["Valid Mobile Number"] !== "Not Found" ? row["Valid Mobile Number"] : Object.values(row)[0]}
                    </TableCell>
                    <TableCell>{row["Line Type"]}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row["Line Type"] === "Mobile"
                            ? "success"
                            : row["Line Type"] === "Landline"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {row["Line Type"] === "Mobile"
                          ? "Valid Mobile"
                          : row["Line Type"] === "Landline"
                            ? "Landline"
                            : "Invalid"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Phone Number Validator</h1>
            <p className="text-muted-foreground mt-2">Validate phone numbers and identify mobile vs landline numbers</p>
          </div>

          <Tabs defaultValue="single" className="w-full">
            <TabsList className="grid grid-cols-2 mb-6">
              <TabsTrigger value="single" className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                <span>Single Number</span>
              </TabsTrigger>
              <TabsTrigger value="file" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span>Bulk Processing</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="space-y-6">
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base">Validate a Phone Number</CardTitle>
                  <CardDescription>Enter a phone number to check if it's a mobile or landline</CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Enter phone number (e.g., +14155552671)"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Button onClick={handleValidateSingle} disabled={isValidating || !phoneNumber} className="gap-2">
                      {isValidating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Validating...
                        </>
                      ) : (
                        "Validate"
                      )}
                    </Button>
                  </div>

                  <div className="mt-4">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Info className="h-3 w-3 mr-1" />
                            <span>Format tips</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            Enter numbers with or without country code.
                            <br />
                            Examples: +14155552671, 14155552671, or 4155552671
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </CardContent>
              </Card>

              {renderResultCard(singleResult)}

              {recentHistory.length > 0 && (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-base">Recent Validations</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Number</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentHistory.map((item, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{item.number}</TableCell>
                            <TableCell>
                              <Badge variant={item.lineType === "mobile" ? "success" : "warning"}>
                                {item.lineType === "mobile" ? "Mobile" : "Landline"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">{item.timestamp}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="file" className="space-y-6">
              {!processedData.length ? (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-base">Bulk Phone Number Validation</CardTitle>
                    <CardDescription>Upload a file with phone numbers to validate in bulk</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center ${
                        dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/20"
                      }`}
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                    >
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="p-3 rounded-full bg-primary/10">
                          <Upload className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">Drag and drop your file here or click to browse</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Supports Excel (.xlsx) and CSV (.csv) files
                          </p>
                        </div>
                        <label htmlFor="file-upload" className="cursor-pointer">
                          <input
                            id="file-upload"
                            type="file"
                            className="sr-only"
                            accept=".xlsx,.csv"
                            onChange={handleFileChange}
                          />
                          <Button variant="outline" className="gap-2">
                            <FileUp className="h-4 w-4" />
                            Browse Files
                          </Button>
                        </label>
                      </div>
                    </div>

                    {file && (
                      <div className="mt-4 space-y-4">
                        <Card className="bg-muted/40">
                          <CardContent className="p-4 flex justify-between items-center">
                            <div>
                              <p className="font-medium">{file.name}</p>
                              <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setFile(null)
                                setShowPreview(false)
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </CardContent>
                        </Card>

                        {renderFilePreview()}

                        <Button onClick={handleProcessFile} disabled={isProcessing} className="w-full gap-2">
                          {isProcessing ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Processing... {progress}%
                            </>
                          ) : (
                            <>Process File</>
                          )}
                        </Button>

                        {isProcessing && <Progress value={progress} className="h-2" />}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                renderProcessedResults()
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
