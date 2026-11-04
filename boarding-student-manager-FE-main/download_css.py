import os
import re
import urllib.request

css_content = """
@import "bootstrap.min.css?v=12";
@import "jquery-ui.min.css?v=12";
@import url('fonts.css?v=12');
@import url('swiper-bundle.min.css?v=12');
@import "awesome-5.min.css?v=12";
@import "slick.css?v=12";
@import "select2.min.css?v=12";
@import "all.css?v=31";
@import "login.css?v=12";
@import "1cuaSV.css?v=17";
@import "register-school.css?v=12";
@import "gochoctap.css?v=12";
@import "tai-chinh.css?v=12";
@import "ketquadangky.css?v=12";
@import "news.css?v=12";
@import "chat.css?v=12";
@import "study-program.css?v=12";
@import "my-calendar.css?v=12";
@import "dangkyhoc-nguyenvong.css?v=12";
@import "danhSachMonDangKyHoc.css?v=13";
@import "select-2-custom.css?v=12";
@import "responsive.css?v=16";
"""

base_url = "https://qldt.utc.edu.vn/congthongtin/assets/css/"
output_dir = "public/assets/css"

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

pattern = r"""@import\s+(?:url\()?['"]([^'"]+)['"](?:\))?[^;]*;"""
matches = re.findall(pattern, css_content)

for match in matches:
    filename_with_query = match
    filename = filename_with_query.split('?')[0]
    
    url = base_url + filename_with_query
    print(f"Downloading {filename}...")
    try:
        # Avoid 403 Forbidden by setting user agent
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response, open(os.path.join(output_dir, filename), 'wb') as out_file:
            out_file.write(response.read())
        print(f"Successfully downloaded {filename}")
    except Exception as e:
        print(f"Failed to download {filename}: {e}")
