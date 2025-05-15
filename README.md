
# TelDirectory - Corporate Phone Directory

TelDirectory is a Next.js web application designed to manage and display a corporate phone directory, primarily for use with Cisco IP phones. It reads directory data from XML files, allowing users to navigate through zones, branches (for specific zones like "Zona Metropolitana"), and localities to find phone extensions. The application also provides an interface to import and manage these XML files, and a search feature to quickly find localities or branches.

## Core Features:

*   **Hierarchical Directory**: Navigate through Zones, Branches (where applicable), and Localities.
*   **Extension Listing**: View department/contact names and their phone extensions.
*   **XML-Based Data**: Directory data is stored in XML files, following Cisco IP Phone standards.
*   **Web Interface**: Browse the directory through a user-friendly web interface.
*   **Search Functionality**: A search bar on each zone page allows users to quickly find localities or branches within that zone by name or ID.
*   **IP Phone Service (Configurable)**: Can serve XML data to Cisco IP phones via specific URL endpoints (this feature can be effectively disabled by removing the relevant API route files if direct XML exposure is not desired).
*   **Data Management**:
    *   Import XML files for zones, branches, and departments.
    *   Add, edit, and delete zones, branches, localities, and extensions directly through the web UI.
*   **Customization**:
    *   Dark Mode support.
    *   Language toggle (English/Español).
    *   Configurable root path for the directory data via the Settings page.
    *   Configurable Host and Port for URLs embedded in XMLs (if IP Phone service is used) via the Settings page.

## Project Structure

*   `src/app/`: Contains the Next.js App Router pages and API routes.
    *   `src/app/[zoneId]/...`: Dynamic routes for displaying zone, branch, and locality pages.
    *   `src/app/ivoxsdir/...`: API routes that serve XML content to IP phones (can be removed if service is not needed).
    *   `src/app/import-xml/`: Page for settings, XML import, and application configuration.
*   `src/components/`: Reusable React components, including search (`src/components/search/`).
*   `src/lib/`: Core logic, data fetching utilities (`data.ts`), server actions (`actions.ts`), and configuration management (`config.ts`).
*   `src/context/`: React context for language management.
*   `src/hooks/`: Custom React hooks.
*   `src/locales/`: JSON files for internationalization (i18n).
*   `ivoxsdir/` (Default location, configurable): **Crucial directory** for storing all XML data.
    *   `ivoxsdir/MAINMENU.xml`: The root XML file for the IP phone directory service.
    *   `ivoxsdir/ZoneBranch/`: Contains XML files for each zone (e.g., `ZonaEste.xml`, `ZonaMetropolitana.xml`).
    *   `ivoxsdir/Branch/`: Contains XML files for branches, primarily used by Zona Metropolitana (e.g., `AdmCorporativo.xml`).
    *   `ivoxsdir/Department/`: Contains XML files for each locality/department, listing extensions (e.g., `Bavaro.xml`, `ContabilidadGeneral.xml`).
*   `.config/directory.config.json`: Stores the custom path to the `ivoxsdir` data if specified in Settings.
*   `public/`: Static assets.

## Setup and Installation

### Prerequisites

*   Node.js (v18.x or later recommended)
*   npm or yarn

### 1. Clone the Repository

```bash
git clone <repository-url>
cd <repository-name>
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```

### 3. `ivoxsdir` Directory Setup

The application relies on XML files. By default, it looks for a directory named `ivoxsdir` at the root of your project. You can change this path via the application's Settings page.

*   **Create the `ivoxsdir` directory** (or your custom named directory) at the root of your project or at your chosen custom location.
*   Inside `ivoxsdir`, create the following subdirectories:
    *   `ZoneBranch`
    *   `Branch`
    *   `Department`
*   **Populate with XML files**:
    *   Place your `MAINMENU.xml` file in the `ivoxsdir` directory.
    *   Place your zone-specific XML files (e.g., `ZonaEste.xml`, `ZonaMetropolitana.xml`) in `ivoxsdir/ZoneBranch/`.
    *   Place your branch-specific XML files (e.g., for Zona Metropolitana's sub-menus like `AdmCendis.xml`) in `ivoxsdir/Branch/`.
    *   Place your department/locality XML files (listing extensions) in `ivoxsdir/Department/`.

    **Example `MAINMENU.xml` content (if using IP Phone service):**
    ```xml
    <?xml version="1.0" encoding="UTF-8" standalone="no"?>
    <CiscoIPPhoneMenu>
      <Title>Farmacia Carol</Title>
      <Prompt>Select a Zone Branch</Prompt>
      <MenuItem>
        <Name>Zona Este</Name>
        <URL>http://YOUR_APP_HOST:YOUR_APP_PORT/ivoxsdir/zonebranch/ZonaEste.xml</URL>
      </MenuItem>
      <!-- Add other zones similarly -->
    </CiscoIPPhoneMenu>
    ```
    **Important (if using IP Phone Service)**: Replace `YOUR_APP_HOST:YOUR_APP_PORT` in your XML files with the actual IP address/hostname and port where the TelDirectory application will be running and accessible to your IP phones. You can configure these values in the application's "Settings" page and use the "Apply Network Settings to XMLs" button to update your files.

    *The application includes sample XML files in the `IVOXS` directory in the initial project structure. You should rename this to `ivoxsdir` (or your custom name) and replace these with your actual directory data.*

## Running the Application

### Development Environment (Prueba)

1.  **Start the development server:**
    ```bash
    npm run dev
    ```
    The application will typically start on `http://localhost:3128` (port configured in `package.json`).

2.  **Accessing the App:**
    *   Web UI: Open `http://localhost:3128` in your browser.
    *   (If IP Phone Service enabled) IP Phone Service URL: `http://YOUR_COMPUTER_IP:3128/ivoxsdir/mainmenu.xml`.

3.  **Data Management:**
    *   The application reads XML files from the configured `ivoxsdir` path (default is project root `ivoxsdir/`).
    *   Any changes made via the UI (adding/editing/deleting items) will directly modify these XML files.

### Production Environment (Productivo)

1.  **Build the Application:**
    ```bash
    npm run build
    ```
    This command creates an optimized production build in the `.next` directory.

2.  **Start the Production Server:**
    ```bash
    npm run start
    ```
    The application will start on port `3128` (as configured in `package.json`).

3.  **Deployment Considerations:**
    *   **`ivoxsdir` Directory**: The `ivoxsdir` directory (with all its XML files) **must be present at the location specified in the application's settings** (or at the project root if using the default). The application reads these files at runtime. If you configured a custom absolute path in settings, ensure that path is accessible to the production server process.
    *   **(If IP Phone Service enabled) IP Address/Hostname & Port**: Ensure that the URLs within your XML files point to the correct public IP address or hostname and port of your production server (e.g., `http://your.server.com:3128/ivoxsdir/mainmenu.xml`). Use the Settings page to configure and apply these.
    *   **Firewall**: Make sure your server's firewall allows incoming connections on the port the application is running on (e.g., port 3128) from the network where your IP phones are located.
    *   **Process Manager**: For long-running production deployments, use a process manager like PM2.
        ```bash
        pm2 start npm --name "teldirectory" -- run start
        ```

4.  **Accessing in Production:**
    *   Web UI: `http://YOUR_SERVER_IP_OR_DOMAIN:3128`
    *   (If IP Phone Service enabled) IP Phone Service URL: `http://YOUR_SERVER_IP_OR_DOMAIN:3128/ivoxsdir/mainmenu.xml`

## Using the Import Feature

The "Settings" page (`/import-xml`) allows you to upload XML files directly:

*   **Import Zone Branch XML**: Upload XML files for specific zones (e.g., `ZonaEste.xml`). These will be saved to `[ivoxsdir_root]/ZoneBranch/`. The filename (without `.xml`) is used as the ID.
*   **Import Department XML Files**: Upload XML files for departments/localities (e.g., `Bavaro.xml`). These will be saved to `[ivoxsdir_root]/Department/`. The filename (without `.xml`) is used as the ID.

**Caution**: Importing files will overwrite existing files with the same name in the target directory.

## Search Functionality

Each zone page features a search bar that allows users to quickly find localities or branches (if applicable, like in Zona Metropolitana) within that specific zone.
*   **How it works**: The search operates on data pre-fetched from the zone's XML file. Filtering is done client-side.
*   **Searched Fields**: Users can search by:
    *   Locality/Branch Name
    *   Locality/Branch ID (filename without .xml)
*   **Results**: Search results display the matching localities or branches, with a direct link to their respective pages.

## XML Structure for IP Phones (if service is enabled)

The application can serve XML data structured for Cisco IP Phones:

*   **Menu Structure (`CiscoIPPhoneMenu`)**: Used for `MAINMENU.xml`, `ZoneBranch/*.xml`, and `Branch/*.xml`. Contains `<MenuItem>` elements with `<Name>` and `<URL>`.
*   **Directory Structure (`CiscoIPPhoneDirectory`)**: Used for `Department/*.xml`. Contains `<DirectoryEntry>` elements with `<Name>` (department/contact) and `<Telephone>` (extension).

Refer to Cisco IP Phone documentation for detailed XML specifications if needed.
