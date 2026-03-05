import asyncio
import httpx
import logging
import time

# Logging setup
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Initialize counters and data structures
total_websites = 0
successful_requests = 0
failed_requests = 0
hpkp_count = 0
expect_ct_count = 0
expect_staple_count = 0
same_site_count = 0
http_only_count = 0
default_src_count = 0
cookie_count = 0
problem_sites = []
forbidden_sites = []
hpkp_sites = []
expect_ct_sites = []
expect_staple_sites = []
same_site_sites = []
http_only_sites = []
default_src_sites = []

# Master dictionary
master_dictionary = {}

# Load sites from file
def load_websites_from_file(file_path):
    global total_websites
    with open(file_path, 'r') as file:
        for index, line in enumerate(file, 1):
            line = line.strip()
            if ", " in line:  # Old format
                category, name, url = line.split(', ')
            else:  # New format (no category or name)
                url = line
                category = "None"  # Default category for new format
                name = f"Site_{index}"  # Use index as the name
            
            # Ensure URL starts with http/https
            if not url.startswith("http"):
                url = f"https://{url}"
            
            # Add to master dictionary
            master_dictionary[name] = {
                "category": category,
                "url": url,
                "header_response": None,
                "parsed_important_info": {
                    "hpkp": "no",
                    "expect_ct": "no",
                    "expect_staple": "no",
                    "same_site": "no",
                    "http_only": "no",
                    "default_src": "no"
                }
            }
            total_websites += 1

# Async function to process a site
async def process_site_async(site_name, index, client):
    global successful_requests, failed_requests
    global hpkp_count, expect_ct_count, expect_staple_count
    global same_site_count, http_only_count, default_src_count, cookie_count

    logger.info(f"Processing {site_name} ({index}) with URL: {master_dictionary[site_name]['url']}")
    site_info = master_dictionary[site_name]
    url = site_info["url"]

    try:
        # Attempt to retrieve headers with a timeout of 10 seconds
        response = await client.get(url, follow_redirects=True, timeout=10)
        headers = response.headers
        site_info["header_response"] = headers

        # Check for HTTP status codes (403, 404)
        if response.status_code == 403:
            logger.info(f"[{index}]INFO: 403 Forbidden received for {site_name}")
            forbidden_sites.append(f"{index}: {site_name} - 403 Forbidden")
        elif response.status_code == 404:
            logger.info(f"[{index}]INFO: 404 Not Found received for {site_name}")
            problem_sites.append(f"{index}: {site_name} - 404 Not Found")

        # Checking each header
        hpkp_header = headers.get("Public-Key-Pins")
        expect_ct_header = headers.get("Expect-CT")
        expect_staple_header = headers.get("Expect-Staple")
        csp_header = headers.get("Content-Security-Policy", "")

        if hpkp_header:
            site_info["parsed_important_info"]["hpkp"] = "yes"
            hpkp_count += 1
            hpkp_sites.append(site_name)
        if expect_ct_header:
            site_info["parsed_important_info"]["expect_ct"] = "yes"
            expect_ct_count += 1
            expect_ct_sites.append(site_name)
        if expect_staple_header:
            site_info["parsed_important_info"]["expect_staple"] = "yes"
            expect_staple_count += 1
            expect_staple_sites.append(site_name)

        # Cookie checks
        cookies = headers.get("Set-Cookie", "")
        if cookies:
            cookie_count += 1
        if "SameSite" in cookies:
            site_info["parsed_important_info"]["same_site"] = "yes"
            same_site_count += 1
            same_site_sites.append(site_name)
        if "HttpOnly" in cookies:
            site_info["parsed_important_info"]["http_only"] = "yes"
            http_only_count += 1
            http_only_sites.append(site_name)
        if "default-src" in csp_header:
            site_info["parsed_important_info"]["default_src"] = "yes"
            default_src_count += 1
            default_src_sites.append(site_name)

        successful_requests += 1
        logger.info(f"[{index}]INFO: Successfully retrieved headers for {site_name}")

    except httpx.RequestError as e:
        failed_requests += 1
        problem_sites.append(f"{index}: {site_name}")
        logger.error(f"[{index}]ERROR: Request error for {site_name}: {e}")

# Async main function
async def main():
    if not master_dictionary:
        logger.error("No websites to process. Exiting.")
        return
    
    async with httpx.AsyncClient() as client:
        tasks = [
            process_site_async(site_name, index, client)
            for index, site_name in enumerate(master_dictionary, 1)
        ]
        await asyncio.gather(*tasks)

# Load websites
load_websites_from_file('new_websites2.txt')

# Debug master_dictionary
for name, site_data in master_dictionary.items():
    print(f"Name: {name}, URL: {site_data['url']}")
print(f"Total websites loaded: {total_websites}")

# Start time tracking
start_time = time.time()

# Run the async main function
asyncio.run(main())

# End time tracking
end_time = time.time()
total_time = end_time - start_time

# Print summary log
summary_log = (
    f"\n--- Summary ---\n"
    f"Total websites processed: {total_websites}\n"
    f"Successful requests: {successful_requests}\n"
    f"Failed requests: {failed_requests}\n"
    f"HPKP headers found: {hpkp_count}\n"
    f"Expect-CT headers found: {expect_ct_count}\n"
    f"Expect-Staple headers found: {expect_staple_count}\n"
    f"Total cookies encountered: {cookie_count}\n"
    f"SameSite cookies found: {same_site_count}\n"
    f"HttpOnly cookies found: {http_only_count}\n"
    f"default-src in CSP found: {default_src_count}\n"
    f"Total time taken: {total_time:.2f} seconds\n"
    f"\nProblem sites:\n" + "\n".join(problem_sites) +
    f"\nForbidden sites:\n" + "\n".join(forbidden_sites)
)
print(summary_log)

# Log to file
with open("header_retrieval_log.txt2", "w") as file:
    file.write(summary_log)
