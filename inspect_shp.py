import shapefile

def inspect(shp_path):
    print(f"=== Inspecting {shp_path} ===")
    sf = shapefile.Reader(shp_path)
    fields = [f[0] for f in sf.fields[1:]]
    print("Fields:", fields)
    print("Total records:", len(sf))
    for i in range(min(5, len(sf))):
        rec = sf.record(i)
        print(f"Record {i}:", dict(zip(fields, rec)))
    print()

inspect(r"D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\GIS\SHP_Indonesia_kecamatan\INDONESIA_KEC.shp")
inspect(r"D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\GIS\SHP_Indonesia_desa\Indo_Desa_region.shp")
