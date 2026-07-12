async function main() {
  console.log('Fetching http://localhost:3000/ ...')
  try {
    const res = await fetch('http://localhost:3000/', { signal: AbortSignal.timeout(5000) })
    console.log('Status:', res.status)
    console.log('Headers:', [...res.headers.entries()])
  } catch (error) {
    console.error('Fetch failed:', error)
  }
}
main()
